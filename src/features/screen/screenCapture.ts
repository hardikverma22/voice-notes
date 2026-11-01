import {
  SIGNATURE_HEIGHT,
  SIGNATURE_WIDTH,
  initialScene,
  keptManually,
  observe,
  signature,
  type SceneState,
} from './sceneChange';

/** A still taken from the shared screen, already encoded. */
export interface CapturedImage {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

export interface ScreenCaptureOptions {
  /** A new frame: the screen changed (auto) or the person asked for one (manual). */
  onFrame(image: CapturedImage, source: 'auto' | 'manual'): void;
  /** The person stopped sharing from the browser's own controls. */
  onEnded(): void;
  /** Auto frames are skipped while this returns true (for example, recording is paused). */
  isPaused?: () => boolean;
  sampleIntervalMs?: number;
}

export interface ScreenCapture {
  /** Takes a frame now. */
  snap(): Promise<void>;
  stop(): void;
}

export type ScreenCaptureErrorCode = 'unsupported' | 'denied' | 'unknown';

export class ScreenCaptureError extends Error {
  constructor(public code: ScreenCaptureErrorCode) {
    super(code);
  }
}

/** Longest side of a stored frame. Big enough to read code and UI text. */
const MAX_SIDE = 1920;

export function isScreenCaptureSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
}

/** Fits width x height inside a max-side box, keeping the aspect ratio. */
export function fitWithin(width: number, height: number, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Asks the person to pick a screen, window or tab, then keeps frames when what is shown
 * changes. Must be called from a click (browsers require a user gesture).
 */
export async function startScreenCapture(options: ScreenCaptureOptions): Promise<ScreenCapture> {
  if (!isScreenCaptureSupported()) throw new ScreenCaptureError('unsupported');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 5, max: 10 } },
      audio: false,
    });
  } catch (error) {
    const name = (error as DOMException | undefined)?.name;
    throw new ScreenCaptureError(
      name === 'NotAllowedError' || name === 'AbortError' ? 'denied' : 'unknown',
    );
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play().catch(() => undefined);

  const thumb = document.createElement('canvas');
  thumb.width = SIGNATURE_WIDTH;
  thumb.height = SIGNATURE_HEIGHT;
  const thumbCtx = thumb.getContext('2d', { willReadFrequently: true });
  const full = document.createElement('canvas');

  let scene: SceneState = initialScene();
  let stopped = false;
  let busy = false;

  const sample = (): Uint8Array | null => {
    if (!thumbCtx || video.videoWidth === 0) return null;
    thumbCtx.drawImage(video, 0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT);
    return signature(thumbCtx.getImageData(0, 0, SIGNATURE_WIDTH, SIGNATURE_HEIGHT).data);
  };

  const encode = async (): Promise<CapturedImage | null> => {
    if (video.videoWidth === 0) return null;
    const size = fitWithin(video.videoWidth, video.videoHeight);
    full.width = size.width;
    full.height = size.height;
    const ctx = full.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, size.width, size.height);
    const blob = await toBlob(full);
    if (!blob) return null;
    return { blob, mimeType: blob.type, ...size };
  };

  const timer = window.setInterval(() => {
    if (stopped || busy || options.isPaused?.()) return;
    const current = sample();
    if (!current) return;
    const result = observe(scene, current, performance.now());
    scene = result.state;
    if (!result.keep) return;
    busy = true;
    void encode()
      .then((image) => {
        if (image && !stopped) options.onFrame(image, 'auto');
      })
      .finally(() => {
        busy = false;
      });
  }, options.sampleIntervalMs ?? 700);

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
  };

  stream.getVideoTracks()[0]?.addEventListener('ended', () => {
    if (stopped) return;
    stop();
    options.onEnded();
  });

  return {
    async snap() {
      if (stopped) return;
      const current = sample();
      if (current) scene = keptManually(current, performance.now());
      const image = await encode();
      if (image && !stopped) options.onFrame(image, 'manual');
    },
    stop,
  };
}

/** WebP where supported (small, sharp text), otherwise JPEG. */
async function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const attempt = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  const webp = await attempt('image/webp', 0.86);
  if (webp && webp.type === 'image/webp') return webp;
  return attempt('image/jpeg', 0.88);
}
