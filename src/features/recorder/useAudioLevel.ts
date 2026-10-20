import { useMotionValue, type MotionValue } from 'motion/react';
import { useEffect } from 'react';

/** Smoothed microphone loudness, 0..1, as a motion value (no React re-renders per frame). */
export function useAudioLevel(analyser: AnalyserNode | null, active = true): MotionValue<number> {
  const level = useMotionValue(0);

  useEffect(() => {
    if (!analyser || !active) {
      level.set(0);
      return;
    }
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let smoothed = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const value of samples) {
        const v = (value - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / samples.length);
      const target = Math.min(1, rms * 4.5);
      smoothed += (target - smoothed) * (target > smoothed ? 0.35 : 0.08);
      level.set(smoothed);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [analyser, active, level]);

  return level;
}
