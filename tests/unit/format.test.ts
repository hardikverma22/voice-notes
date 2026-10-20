import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from '../../src/lib/format';

describe('formatDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5_000)).toBe('0:05');
    expect(formatDuration(65_900)).toBe('1:05');
  });

  it('uses h:mm:ss at one hour or more', () => {
    expect(formatDuration(3_600_000)).toBe('1:00:00');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('clamps negative input to zero', () => {
    expect(formatDuration(-1000)).toBe('0:00');
  });
});

describe('formatBytes', () => {
  it('uses bytes below 1000', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('uses base 1000 with one decimal', () => {
    expect(formatBytes(1000)).toBe('1.0 kB');
    expect(formatBytes(12_300_000)).toBe('12.3 MB');
    expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
  });
});
