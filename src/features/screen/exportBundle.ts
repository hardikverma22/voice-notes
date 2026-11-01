import { strToU8, zipSync, type Zippable } from 'fflate';
import { getAudio } from '../../storage/audio';
import type { Note } from '../../storage/db';
import { listNoteFrames } from '../../storage/frames';
import { fileNameFor } from '../notes/exportNote';
import { extensionFor } from '../recorder/mime';
import { flattenFrame } from './annotation';
import {
  buildReportHtml,
  buildReportMarkdown,
  extensionForImage,
  frameFileName,
  type ReportFrame,
} from './report';
import { pairSpeech } from './timeline';

/** Audio larger than this is left out of report.html (it is still in the zip). */
const MAX_INLINE_AUDIO_BYTES = 12_000_000;

export interface Bundle {
  blob: Blob;
  name: string;
  frames: number;
}

/**
 * Zips a note for handing to an AI agent or a teammate: report.md (for agents), report.html
 * (one self-contained page for people), the frames with drawings flattened in, and the audio.
 * Loaded on demand from the note page, so fflate stays out of the start-up bundle.
 */
export async function buildBundle(note: Note, noteMarkdown: string): Promise<Bundle> {
  const frames = await listNoteFrames(note.id);
  const paired = pairSpeech(frames, note.segments);
  const files: Zippable = {};

  const reportFrames: ReportFrame[] = [];
  for (const [index, { frame, text }] of paired.entries()) {
    // Keep the capture's own format (WebP, or JPEG on Safari): small, and agents read both.
    const type = frame.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const image = await flattenFrame(frame, type);
    const file = frameFileName(index, frame.t, extensionForImage(image.type));
    files[file] = [new Uint8Array(await image.arrayBuffer()), { level: 0 }];
    reportFrames.push({
      file,
      t: frame.t,
      marked: frame.strokes.length > 0,
      text,
      screenText: frame.text,
      dataUrl: await toDataUrl(image),
    });
  }

  const audioRecord = note.audioId ? await getAudio(note.audioId) : undefined;
  let audio: { file: string; dataUrl?: string } | undefined;
  if (audioRecord) {
    const file = `audio.${extensionFor(audioRecord.mimeType)}`;
    files[file] = [new Uint8Array(await audioRecord.blob.arrayBuffer()), { level: 0 }];
    audio = {
      file,
      dataUrl:
        audioRecord.blob.size <= MAX_INLINE_AUDIO_BYTES
          ? await toDataUrl(audioRecord.blob)
          : undefined,
    };
  }

  const input = {
    title: note.title,
    createdAt: note.createdAt,
    durationMs: note.durationMs,
    noteMarkdown,
    frames: reportFrames,
    segments: note.segments,
    bookmarks: note.bookmarks,
    transcriptPending: note.status !== 'ready',
    audio,
  };
  files['report.md'] = strToU8(buildReportMarkdown(input));
  files['report.html'] = strToU8(buildReportHtml(input));

  const zipped = zipSync(files, { level: 6 });
  return {
    blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    name: fileNameFor(note.title, note.createdAt, 'zip'),
    frames: frames.length,
  };
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the file'));
    reader.readAsDataURL(blob);
  });
}
