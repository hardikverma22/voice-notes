import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_SEC, SAMPLE_RATE } from '../transcribe/config';
import { PcmBuffer } from './pcmBuffer';
import { RecorderError, startRecording, type RecordingHandle } from './recorder';

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'stopping' | 'error';

export interface RecordingResult {
  pcm: Float32Array; // 16 kHz mono, whole recording
  chunks: Blob[]; // MediaRecorder chunks, in order (first has the container header)
  mimeType: string;
  durationMs: number;
}

export interface UseRecorderOptions {
  onStarted?: (getPcm: () => PcmBuffer) => void;
  onChunk?: (blob: Blob, index: number, mimeType: string) => void;
  onFinished?: (result: RecordingResult) => void;
}

const TICK_MS = 250;

export function useRecorder(options: UseRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<RecorderError | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const stateRef = useRef<RecorderState>('idle');
  const handleRef = useRef<RecordingHandle | null>(null);
  const pcmRef = useRef<PcmBuffer>(new PcmBuffer());
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const optionsRef = useRef(options);
  const stopRef = useRef<() => Promise<RecordingResult | null>>(async () => null);

  useEffect(() => {
    optionsRef.current = options;
  });

  const setPhase = useCallback((next: RecorderState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    const handle = handleRef.current;
    if (!handle || stateRef.current !== 'recording') return null;
    setPhase('stopping');
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;

    const { durationMs } = await handle.stop();
    handleRef.current = null;
    setAnalyser(null);
    setElapsedMs(durationMs);

    const result: RecordingResult = {
      pcm: pcmRef.current.toFloat32Array(),
      chunks: chunksRef.current.slice(),
      mimeType: handle.mimeType,
      durationMs,
    };
    setPhase('idle');
    optionsRef.current.onFinished?.(result);
    return result;
  }, [setPhase]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (stateRef.current !== 'idle' && stateRef.current !== 'error') return;
    setPhase('requesting');
    setError(null);
    setElapsedMs(0);
    pcmRef.current = new PcmBuffer();
    chunksRef.current = [];

    try {
      const handle = await startRecording({
        onPcm16k: (samples) => pcmRef.current.append(samples),
        onChunk: (blob, index, mime) => {
          chunksRef.current.push(blob);
          optionsRef.current.onChunk?.(blob, index, mime);
        },
      });
      handleRef.current = handle;
      setAnalyser(handle.analyser);
      setPhase('recording');
      optionsRef.current.onStarted?.(() => pcmRef.current);
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - handle.startedAt;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_SEC * 1000) void stopRef.current();
      }, TICK_MS);
    } catch (caught) {
      const err =
        caught instanceof RecorderError
          ? caught
          : new RecorderError('unknown', caught instanceof Error ? caught.message : String(caught));
      setError(err);
      setPhase('error');
    }
  }, [setPhase]);

  // Cleanup on unmount: stop timers and release the microphone.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      const handle = handleRef.current;
      handleRef.current = null;
      void handle?.cancel();
    };
  }, []);

  return {
    state,
    elapsedMs,
    error,
    analyser,
    start,
    stop,
    sampleRate: SAMPLE_RATE,
  };
}
