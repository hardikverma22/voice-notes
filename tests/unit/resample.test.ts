import { describe, expect, it } from 'vitest';
import { createStreamingResampler } from '../../src/features/recorder/resample';

function sine(freq: number, rate: number, seconds: number): Float32Array {
  const out = new Float32Array(rate * seconds);
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function countZeroCrossings(x: Float32Array): number {
  let count = 0;
  for (let i = 1; i < x.length; i++) {
    if ((x[i - 1] ?? 0) < 0 !== (x[i] ?? 0) < 0) count++;
  }
  return count;
}

describe('createStreamingResampler', () => {
  it('produces about one output sample per ratio input samples', () => {
    const out = createStreamingResampler(48_000, 16_000).push(new Float32Array(48_000));
    expect(Math.abs(out.length - 16_000)).toBeLessThanOrEqual(1);
  });

  it('keeps the frequency of a 440 Hz sine within 2%', () => {
    const out = createStreamingResampler(48_000, 16_000).push(sine(440, 48_000, 1));
    const crossings = countZeroCrossings(out);
    expect(Math.abs(crossings - 880) / 880).toBeLessThan(0.02);
  });

  it('gives the same output whether pushed whole or in random pieces', () => {
    const input = sine(300, 48_000, 2);
    const whole = createStreamingResampler(48_000, 16_000).push(input);

    const streaming = createStreamingResampler(48_000, 16_000);
    const parts: Float32Array[] = [];
    let offset = 0;
    let seed = 7;
    while (offset < input.length) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const size = 1 + (seed % 3000);
      parts.push(streaming.push(input.slice(offset, offset + size)));
      offset += size;
    }
    const joined = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const part of parts) {
      joined.set(part, at);
      at += part.length;
    }

    expect(joined.length).toBe(whole.length);
    let maxDiff = 0;
    for (let i = 0; i < whole.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs((whole[i] ?? 0) - (joined[i] ?? 0)));
    }
    expect(maxDiff).toBeLessThan(1e-6);
  });

  it('returns a copy when the rates match', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const out = createStreamingResampler(16_000, 16_000).push(input);
    expect(out[0]).toBeCloseTo(0.1, 6);
    expect(out[1]).toBeCloseTo(0.2, 6);
    expect(out[2]).toBeCloseTo(0.3, 6);
    expect(out).not.toBe(input);
  });
});
