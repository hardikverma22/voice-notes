import { useCallback, useEffect, useRef, useState } from 'react';
import type { PcmBuffer } from '../recorder/pcmBuffer';
import { LIVE_TICK_MS, SAMPLE_RATE } from './config';
import { applyLiveResult, initialLiveState, type LiveState } from './merge';
import type { TranscribeResult } from './whisperClient';

type Transcribe = (kind: 'live', audio: Float32Array) => Promise<TranscribeResult>;

/**
 * Runs the live loop: every LIVE_TICK_MS, sends the audio after the last committed point
 * as a live request, unless one is already in flight. Results fold into LiveState.
 */
export function useLiveTranscript(transcribe: Transcribe) {
  const [state, setState] = useState<LiveState>(initialLiveState);
  const stateRef = useRef<LiveState>(state);
  const timerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const getPcmRef = useRef<(() => PcmBuffer) | null>(null);
  const transcribeRef = useRef(transcribe);

  useEffect(() => {
    transcribeRef.current = transcribe;
  });

  const update = useCallback((next: LiveState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const tick = useCallback(() => {
    const getPcm = getPcmRef.current;
    if (!getPcm || inFlightRef.current) return;
    const pcm = getPcm();
    const windowStartSec = stateRef.current.committedUntilSec;
    const startSample = Math.round(windowStartSec * SAMPLE_RATE);
    const endSample = pcm.length;
    if (endSample - startSample < SAMPLE_RATE / 2) return; // less than 0.5 s of new audio

    const audio = pcm.slice(startSample, endSample);
    const windowEndSec = endSample / SAMPLE_RATE;
    inFlightRef.current = true;
    transcribeRef
      .current('live', audio)
      .then((result) => {
        update(
          applyLiveResult(stateRef.current, {
            chunks: result.chunks,
            windowStartSec,
            windowEndSec,
          }),
        );
      })
      .catch(() => {
        // A superseded or failed live pass is harmless: the next tick retries.
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [update]);

  const start = useCallback(
    (getPcm: () => PcmBuffer) => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      getPcmRef.current = getPcm;
      inFlightRef.current = false;
      update(initialLiveState());
      timerRef.current = window.setInterval(tick, LIVE_TICK_MS);
    },
    [tick, update],
  );

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    getPcmRef.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { state, start, stop };
}
