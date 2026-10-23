import { describe, expect, it } from 'vitest';
import { looksStuck } from '../../src/features/transcribe/stuck';

describe('looksStuck', () => {
  it('spots the loops seen on a real Hindi note', () => {
    expect(looksStuck('अगर आबाज ' + 'आप '.repeat(40))).toBe(true);
    expect(looksStuck('नहीं लग़' + 'दा'.repeat(60))).toBe(true);
    expect(looksStuck('आप आ� आ�')).toBe(true);
  });

  it('leaves normal speech alone, including a little repetition', () => {
    expect(looksStuck('The quick brown fox jumps over the lazy dog.')).toBe(false);
    expect(looksStuck('No, no, no, I meant the other one. Okay okay, fine.')).toBe(false);
    expect(
      looksStuck('अगर आवाज आ रही है तो बताओ मैं क्या कहा, मैं इस मॉडल को टेस्ट कर रहा हूं'),
    ).toBe(false);
  });
});
