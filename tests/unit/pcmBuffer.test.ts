import { describe, expect, it } from 'vitest';
import { PcmBuffer } from '../../src/features/recorder/pcmBuffer';

describe('PcmBuffer', () => {
  it('grows beyond its initial capacity and keeps every sample', () => {
    const buffer = new PcmBuffer(4);
    buffer.append(new Float32Array([1, 2, 3]));
    buffer.append(new Float32Array([4, 5, 6, 7, 8, 9, 10]));
    expect(buffer.length).toBe(10);
    expect(Array.from(buffer.toFloat32Array())).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('returns a copy from slice', () => {
    const buffer = new PcmBuffer(4);
    buffer.append(new Float32Array([1, 2, 3, 4]));
    const part = buffer.slice(1, 3);
    part[0] = 99;
    expect(Array.from(buffer.slice(1, 3))).toEqual([2, 3]);
  });

  it('reports duration at 16 kHz by default', () => {
    const buffer = new PcmBuffer();
    buffer.append(new Float32Array(16_000 * 2));
    expect(buffer.durationSec()).toBe(2);
  });
});
