import { describe, expect, it } from 'vitest';
import {
  applyLiveResult,
  displayText,
  initialLiveState,
  joinSegments,
  type LiveState,
} from '../../src/features/transcribe/merge';
import type { Segment } from '../../src/features/transcribe/protocol';

const seg = (text: string, start: number, end: number | null): Segment => ({ text, start, end });

describe('applyLiveResult', () => {
  it('keeps a short window tentative only', () => {
    const state = applyLiveResult(initialLiveState(), {
      chunks: [seg(' hello there ', 0, 2)],
      windowStartSec: 0,
      windowEndSec: 8,
    });
    expect(state.committed).toEqual([]);
    expect(state.committedUntilSec).toBe(0);
    expect(state.tentative).toBe('hello there');
  });

  it('commits chunks before the guard band and keeps the rest tentative', () => {
    // 22 s window, boundary = 19 s. Chunks ending at 5, 12, 18.5 commit; 21 does not.
    const result = applyLiveResult(initialLiveState(), {
      chunks: [seg('one', 0, 5), seg('two', 5, 12), seg('three', 12, 18.5), seg('four', 18.5, 21)],
      windowStartSec: 0,
      windowEndSec: 22,
    });
    expect(result.committed.map((s) => s.text)).toEqual(['one', 'two', 'three']);
    expect(result.committedUntilSec).toBe(18.5);
    expect(result.tentative).toBe('four');
  });

  it('shifts committed times by the window start', () => {
    const result = applyLiveResult(
      { committed: [], committedUntilSec: 30, tentative: '' },
      {
        chunks: [seg('a', 0, 4), seg('b', 4, 20)],
        windowStartSec: 30,
        windowEndSec: 52,
      },
    );
    expect(result.committed[0]).toEqual({ text: 'a', start: 30, end: 34 });
    expect(result.committedUntilSec).toBe(34);
  });

  it('never commits a chunk with a null end', () => {
    const result = applyLiveResult(initialLiveState(), {
      chunks: [seg('open', 0, null)],
      windowStartSec: 0,
      windowEndSec: 22,
    });
    expect(result.committed).toEqual([]);
    expect(result.tentative).toBe('open');
  });

  it('force-commits a long window with only a null-end chunk as one segment', () => {
    const result = applyLiveResult(initialLiveState(), {
      chunks: [seg('long speech', 0, null)],
      windowStartSec: 0,
      windowEndSec: 28,
    });
    expect(result.committed).toEqual([{ text: 'long speech', start: 0, end: 28 }]);
    expect(result.committedUntilSec).toBe(28);
    expect(result.tentative).toBe('');
  });

  it('drops Whisper silence outputs', () => {
    const result = applyLiveResult(initialLiveState(), {
      chunks: [seg(' [BLANK_AUDIO] ', 0, 5), seg('real words', 5, 9), seg('[ Silence ]', 9, 12)],
      windowStartSec: 0,
      windowEndSec: 22,
    });
    expect(result.committed.map((s) => s.text)).toEqual(['real words']);
  });

  it('does not mutate the input state', () => {
    const state: LiveState = {
      committed: [seg('kept', 0, 1)],
      committedUntilSec: 1,
      tentative: 'x',
    };
    const snapshot = JSON.stringify(state);
    applyLiveResult(state, {
      chunks: [seg('new', 1, 5)],
      windowStartSec: 1,
      windowEndSec: 25,
    });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('joinSegments and displayText', () => {
  it('trims, joins with single spaces, and collapses whitespace', () => {
    expect(joinSegments([seg('  a  ', 0, 1), seg('b\n\nc', 1, 2), seg('   ', 2, 3)])).toBe('a b c');
  });

  it('separates committed and tentative text', () => {
    const text = displayText({
      committed: [seg('done.', 0, 1)],
      committedUntilSec: 1,
      tentative: 'maybe',
    });
    expect(text).toEqual({ committed: 'done.', tentative: 'maybe' });
  });
});
