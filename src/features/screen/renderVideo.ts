import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny';
import { formatDate } from '../../lib/format';
import { getAudio } from '../../storage/audio';
import type { Frame, Note } from '../../storage/db';
import { listNoteFrames } from '../../storage/frames';
import { fileNameFor } from '../notes/exportNote';
import { flattenFrame } from './annotation';
import { planScenes, wrapLines, type Scene } from './videoPlan';

/**
 * Renders a screen note as an MP4: each frame with its marks, the spoken words as captions,
 * and the recording as the soundtrack. Encoded on this device with WebCodecs, much faster than
 * real time because the picture is only encoded when it changes. Loaded on demand.
 */

const WIDTH = 1920;
const HEIGHT = 1080;
/** Video length when there is no audio: until a few seconds after the last frame. */
const SILENT_TAIL_SEC = 4;

export class VideoUnsupportedError extends Error {
  constructor() {
    super('This browser cannot encode video. Try Chrome, Edge or a recent Safari or Firefox.');
  }
}

export interface RenderedVideo {
  blob: Blob;
  name: string;
}

export async function renderVideo(
  note: Note,
  onProgress: (fraction: number) => void,
): Promise<RenderedVideo> {
  if (typeof VideoEncoder === 'undefined') throw new VideoUnsupportedError();
  const frames = await listNoteFrames(note.id);
  if (frames.length === 0) throw new Error('This note has no screen frames.');

  const record = note.audioId ? await getAudio(note.audioId) : undefined;
  const audio = record ? await decodeAudio(record.blob) : null;
  const lastFrame = frames[frames.length - 1]!.t;
  const duration = audio ? audio.duration : lastFrame + SILENT_TAIL_SEC;

  const videoCodec = await getFirstEncodableVideoCodec(['avc', 'vp9', 'av1'], {
    width: WIDTH,
    height: HEIGHT,
  });
  if (!videoCodec) throw new VideoUnsupportedError();
  const audioCodec = audio
    ? await getFirstEncodableAudioCodec(['aac', 'opus'], {
        numberOfChannels: audio.numberOfChannels,
        sampleRate: audio.sampleRate,
      })
    : null;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new VideoUnsupportedError();

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const video = new CanvasSource(canvas, { codec: videoCodec, quality: QUALITY_HIGH });
  output.addVideoTrack(video, { frameRate: 30 });
  const sound =
    audio && audioCodec
      ? new AudioBufferSource({ codec: audioCodec, quality: QUALITY_HIGH })
      : null;
  if (sound) output.addAudioTrack(sound);
  await output.start();

  // Scenes come in time order, so only the frame on screen is decoded: a 20-minute recording
  // with hundreds of full-HD frames needs one frame's memory, not all of them at once.
  const shown: { index: number; image: ImageBitmap | null } = { index: -1, image: null };
  const imageFor = async (index: number): Promise<ImageBitmap> => {
    if (shown.image && shown.index === index) return shown.image;
    shown.image?.close();
    shown.image = await createImageBitmap(await flattenFrame(frames[index]!));
    shown.index = index;
    return shown.image;
  };

  try {
    const scenes = planScenes(frames, note.segments, duration);
    const title = `${note.title || 'Screen recording'} · ${formatDate(note.createdAt)}`;
    const spoken = note.segments.filter((segment) => segment.text.trim());
    for (const [index, scene] of scenes.entries()) {
      const image = await imageFor(scene.frame);
      drawScene(ctx, scene, frames[scene.frame]!, image, spoken, title);
      await video.add(scene.start, scene.end - scene.start);
      onProgress(((index + 1) / scenes.length) * (sound ? 0.85 : 1));
    }
    if (sound && audio) await sound.add(audio);
    await output.finalize();
  } catch (error) {
    await output.cancel();
    throw error;
  } finally {
    shown.image?.close();
  }
  onProgress(1);

  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('The video could not be written.');
  return {
    blob: new Blob([buffer], { type: 'video/mp4' }),
    name: fileNameFor(note.title, note.createdAt, 'mp4'),
  };
}

async function decodeAudio(blob: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    void context.close();
  }
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  frame: Frame,
  image: ImageBitmap,
  spoken: { text: string }[],
  title: string,
): void {
  ctx.fillStyle = '#0b0b0c';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // The frame, letterboxed.
  const scale = Math.min(WIDTH / frame.width, HEIGHT / frame.height);
  const w = frame.width * scale;
  const h = frame.height * scale;
  ctx.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);

  ctx.textBaseline = 'middle';
  if (scene.title) {
    ctx.font = '600 38px system-ui, -apple-system, "Segoe UI", sans-serif';
    const text = title.length > 90 ? `${title.slice(0, 89)}…` : title;
    const width = ctx.measureText(text).width;
    roundRect(ctx, 48, 44, width + 56, 76, 38, 'rgba(0, 0, 0, 0.72)');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 76, 82);
  }

  const caption = scene.caption >= 0 ? spoken[scene.caption]?.text.trim() : '';
  if (caption) {
    ctx.font = '500 44px system-ui, -apple-system, "Segoe UI", sans-serif';
    const lines = wrapLines(caption, WIDTH - 360, (text) => ctx.measureText(text).width);
    const lineHeight = 60;
    const boxHeight = lines.length * lineHeight + 36;
    const boxWidth = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 64;
    const top = HEIGHT - 56 - boxHeight;
    roundRect(ctx, (WIDTH - boxWidth) / 2, top, boxWidth, boxHeight, 20, 'rgba(0, 0, 0, 0.78)');
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    lines.forEach((line, i) => ctx.fillText(line, WIDTH / 2, top + 18 + lineHeight * (i + 0.5)));
    ctx.textAlign = 'start';
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
