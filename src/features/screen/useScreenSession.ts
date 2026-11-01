import { useCallback, useEffect, useRef, useState } from 'react';
import { addSessionFrame } from '../../storage/frames';
import {
  ScreenCaptureError,
  isScreenCaptureSupported,
  startScreenCapture,
  type ScreenCapture,
  type ScreenCaptureErrorCode,
} from './screenCapture';

export type ScreenStatus = 'off' | 'starting' | 'on';

interface Options {
  /** The recording session frames belong to. */
  getSessionId(): string | null;
  /** Seconds into the recording, for each frame's time. */
  getTime(): number;
  isPaused(): boolean;
  onError(code: ScreenCaptureErrorCode): void;
}

/**
 * The screen share that runs alongside a recording. Every frame is written to IndexedDB under
 * the recording's session as soon as it is taken, so an interrupted recording keeps them.
 */
export function useScreenSession(options: Options) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  const captureRef = useRef<ScreenCapture | null>(null);
  /** Frame writes still in flight, so a save can wait for them before moving frames. */
  const pendingRef = useRef(new Set<Promise<unknown>>());
  const [status, setStatus] = useState<ScreenStatus>('off');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [lastFrameAt, setLastFrameAt] = useState<number | null>(null);

  const stop = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    setStatus('off');
    setStream(null);
  }, []);

  /** Starts sharing. Resolves to false when the person cancelled or it failed. */
  const start = useCallback(async (): Promise<boolean> => {
    if (captureRef.current) return true;
    setStatus('starting');
    try {
      captureRef.current = await startScreenCapture({
        isPaused: () => optionsRef.current.isPaused(),
        onEnded: () => {
          captureRef.current = null;
          setStatus('off');
          setStream(null);
        },
        onFrame: (image, source) => {
          const sessionId = optionsRef.current.getSessionId();
          if (!sessionId) return;
          const t = optionsRef.current.getTime();
          const write = addSessionFrame(sessionId, { ...image, t, source })
            .then(() => {
              setFrameCount((count) => count + 1);
              setLastFrameAt(Date.now());
            })
            .catch((error: unknown) => console.error('Could not save a screen frame', error))
            .finally(() => pendingRef.current.delete(write));
          pendingRef.current.add(write);
        },
      });
      setStream(captureRef.current.stream);
      setStatus('on');
      return true;
    } catch (error) {
      setStatus('off');
      const code = error instanceof ScreenCaptureError ? error.code : 'unknown';
      if (code !== 'denied') optionsRef.current.onError(code);
      return false;
    }
  }, []);

  const snap = useCallback(() => {
    const capture = captureRef.current;
    if (!capture) return;
    // The encode runs before the frame is written; count it as in flight too.
    const shot = capture.snap().finally(() => pendingRef.current.delete(shot));
    pendingRef.current.add(shot);
  }, []);

  /** Resolves once every frame taken so far is in IndexedDB. */
  const settle = useCallback(async () => {
    while (pendingRef.current.size > 0) await Promise.allSettled([...pendingRef.current]);
  }, []);
  const reset = useCallback(() => {
    setFrameCount(0);
    setLastFrameAt(null);
  }, []);

  useEffect(() => () => captureRef.current?.stop(), []);

  return {
    status,
    stream,
    frameCount,
    lastFrameAt,
    supported: isScreenCaptureSupported(),
    start,
    stop,
    snap,
    settle,
    reset,
  };
}
