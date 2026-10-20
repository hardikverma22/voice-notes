import { useEffect, useRef } from 'react';

function readAccent(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--vn-accent').trim();
  // --vn-accent is always defined on :root (src/design/tokens.css), so no fallback literal is needed.
  return value;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Live audio level from an AnalyserNode. Reduced motion draws a level bar at most 4 times a second. */
export function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const reduced = prefersReducedMotion();
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    let lastDraw = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (reduced && now - lastDraw < 250) return;
      lastDraw = now;

      analyser.getByteTimeDomainData(samples);
      const { width, height } = canvas;
      const mid = height / 2;
      context.clearRect(0, 0, width, height);
      context.strokeStyle = readAccent();
      context.fillStyle = context.strokeStyle;
      context.lineWidth = Math.max(2, Math.round(height / 40));

      if (reduced) {
        let sum = 0;
        for (const value of samples) {
          const v = (value - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / samples.length);
        const barHeight = Math.max(2, rms * height);
        context.fillRect(width / 2 - 20, mid - barHeight / 2, 40, barHeight);
        return;
      }

      context.beginPath();
      const step = width / samples.length;
      for (let i = 0; i < samples.length; i++) {
        const y = mid + (((samples[i] ?? 128) - 128) / 128) * (height * 0.45);
        if (i === 0) context.moveTo(0, y);
        else context.lineTo(i * step, y);
      }
      context.stroke();
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Live audio level"
      className="h-24 w-full rounded-md bg-surface"
    />
  );
}
