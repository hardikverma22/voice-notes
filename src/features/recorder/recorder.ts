import workletUrl from './pcm-capture.worklet.ts?worker&url';
import { SAMPLE_RATE } from '../transcribe/config';
import { pickMimeType } from './mime';
import { createStreamingResampler } from './resample';

export type RecorderErrorCode =
  'permission-denied' | 'no-microphone' | 'mic-busy' | 'insecure-context' | 'unknown';

export class RecorderError extends Error {
  constructor(
    readonly code: RecorderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecorderError';
  }
}

export interface RecordingHandle {
  analyser: AnalyserNode;
  mimeType: string;
  startedAt: number;
  stop(): Promise<{ durationMs: number }>;
  cancel(): Promise<void>;
}

export interface RecorderOptions {
  onPcm16k(samples: Float32Array): void;
  onChunk(blob: Blob, index: number, mimeType: string): void;
}

function mapMediaError(error: unknown): RecorderError {
  const name = (error as { name?: string } | null)?.name ?? '';
  const message = error instanceof Error ? error.message : String(error);
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new RecorderError('permission-denied', message);
    case 'NotFoundError':
    case 'OverconstrainedError':
      return new RecorderError('no-microphone', message);
    case 'NotReadableError':
      return new RecorderError('mic-busy', message);
    default:
      return new RecorderError('unknown', message);
  }
}

/**
 * Starts microphone capture. Call this synchronously from a click or keydown handler:
 * the AudioContext is created and resumed before the first await (see pitfall 13.6).
 */
export async function startRecording(opts: RecorderOptions): Promise<RecordingHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new RecorderError('insecure-context', 'Recording needs a secure context.');
  }

  const ctx = new AudioContext();
  void ctx.resume();

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  } catch (error) {
    await ctx.close();
    throw mapMediaError(error);
  }

  try {
    await ctx.audioWorklet.addModule(workletUrl);
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    await ctx.close();
    throw error;
  }

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;
  const worklet = new AudioWorkletNode(ctx, 'pcm-capture');
  source.connect(analyser);
  source.connect(worklet);
  // Deliberately not connected to ctx.destination: that would feed the mic back to the speakers.

  const resampler = createStreamingResampler(ctx.sampleRate, SAMPLE_RATE);
  worklet.port.onmessage = (event: MessageEvent<Float32Array>) => {
    opts.onPcm16k(resampler.push(event.data));
  };

  const requestedMime = pickMimeType();
  const recorder = new MediaRecorder(
    stream,
    requestedMime ? { mimeType: requestedMime, audioBitsPerSecond: 32_000 } : undefined,
  );
  const mimeType = recorder.mimeType || requestedMime || '';
  let index = 0;
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) opts.onChunk(event.data, index++, mimeType);
  };
  recorder.start(1000);

  const startedAt = Date.now();

  async function teardown(): Promise<void> {
    worklet.port.onmessage = null;
    source.disconnect();
    worklet.disconnect();
    stream.getTracks().forEach((track) => track.stop());
    await ctx.close();
  }

  return {
    analyser,
    mimeType,
    startedAt,
    stop: () =>
      new Promise((resolve) => {
        const finish = () =>
          void teardown().then(() => resolve({ durationMs: Date.now() - startedAt }));
        if (recorder.state === 'inactive') {
          finish();
          return;
        }
        recorder.addEventListener('stop', finish, { once: true });
        recorder.stop();
      }),
    cancel: async () => {
      recorder.ondataavailable = null;
      if (recorder.state !== 'inactive') recorder.stop();
      await teardown();
    },
  };
}
