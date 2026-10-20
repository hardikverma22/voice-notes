import { useEffect, useRef } from 'react';

function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const BAR_WIDTH = 3;
const BAR_GAP = 3;

/**
 * Scrolling level meter: one bar per ~70 ms, newest on the right. Paused input stops the scroll.
 * Reduced motion updates four times a second.
 */
export function Waveform({
  analyser,
  paused = false,
  tone = '--vn-accent',
}: {
  analyser: AnalyserNode | null;
  paused?: boolean;
  tone?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const reduced = prefersReducedMotion();
    const interval = reduced ? 250 : 70;
    const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
    const history: number[] = [];
    let frame = 0;
    let lastPush = 0;
    let dpr = 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const color = readToken(tone);
    const idle = readToken('--vn-border');

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const { width, height } = canvas;
      const step = (BAR_WIDTH + BAR_GAP) * dpr;
      const capacity = Math.ceil(width / step);

      if (analyser && samples && !pausedRef.current && now - lastPush >= interval) {
        lastPush = now;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) {
          const v = (value - 128) / 128;
          sum += v * v;
        }
        history.push(Math.min(1, Math.sqrt(sum / samples.length) * 5));
        if (history.length > capacity) history.splice(0, history.length - capacity);
      } else if (!analyser && history.length > 0) {
        history.length = 0;
      }

      context.clearRect(0, 0, width, height);
      const mid = height / 2;
      const barWidth = BAR_WIDTH * dpr;
      for (let i = 0; i < capacity; i++) {
        const value = history[history.length - capacity + i];
        const x = i * step;
        if (value === undefined) {
          context.fillStyle = idle;
          context.fillRect(x, mid - dpr, barWidth, 2 * dpr);
          continue;
        }
        const h = Math.max(2 * dpr, value * (height - 4 * dpr));
        context.fillStyle = color;
        context.globalAlpha = 0.35 + 0.65 * (i / capacity);
        context.beginPath();
        context.roundRect(x, mid - h / 2, barWidth, h, barWidth / 2);
        context.fill();
        context.globalAlpha = 1;
      }
    };

    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [analyser, tone]);

  return (
    <canvas ref={canvasRef} role="img" aria-label="Live audio level" className="h-16 w-full" />
  );
}
