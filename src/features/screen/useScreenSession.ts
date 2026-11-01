import { useCallback, useEffect, useRef, useState } from 'react';
import type { Frame } from '../../storage/db';
import { addSessionFrame } from '../../storage/frames';
import {
  ScreenCaptureError,
  type CapturedImage,
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

  /** Tracks work that ends in a frame write, so settle() can wait for it. */
  const track = useCallback(<T>(work: Promise<T>): Promise<T> => {
    const tracked = work.finally(() => pendingRef.current.delete(tracked));
    pendingRef.current.add(tracked);
    return tracked;
  }, []);

  /** Writes a frame under the running recording's session. */
  const store = useCallback(
    (image: CapturedImage, source: Frame['source']): Promise<Frame | null> => {
      const sessionId = optionsRef.current.getSessionId();
      if (!sessionId) return Promise.resolve(null);
      const t = optionsRef.current.getTime();
      return track(
        addSessionFrame(sessionId, { ...image, t, source })
          .then((frame) => {
            setFrameCount((count) => count + 1);
            setLastFrameAt(Date.now());
            return frame;
          })
          .catch((error: unknown) => {
            console.error('Could not save a screen frame', error);
            return null;
          }),
      );
    },
    [track],
  );

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
        onFrame: (image) => void store(image, 'auto'),
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
  }, [store]);

  /** Takes a frame now. Resolves to the stored frame, or null. */
  const snap = useCallback(async (): Promise<Frame | null> => {
    const capture = captureRef.current;
    if (!capture) return null;
    // The encode runs before the frame is written; count it as in flight too.
    const image = await track(capture.snap());
    return image ? store(image, 'manual') : null;
  }, [track, store]);

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
