import { describe, expect, it } from 'vitest';
import { TITLE_SEC, planScenes, wrapLines } from '../../src/features/screen/videoPlan';

const seg = (start: number, end: number, text: string) => ({ start, end, text });

describe('planScenes', () => {
  const frames = [{ t: 0 }, { t: 10 }];

  it('covers the whole video with no gaps or overlaps', () => {
    const scenes = planScenes(frames, [seg(1, 3, 'hi'), seg(12, 14, 'there')], 20);
    expect(scenes[0]!.start).toBe(0);
    expect(scenes[scenes.length - 1]!.end).toBe(20);
    for (let i = 1; i < scenes.length; i++)
      expect(scenes[i]!.start).toBeCloseTo(scenes[i - 1]!.end);
  });

  it('switches frame with the speech lead, and caps scene length for seeking', () => {
    const scenes = planScenes(frames, [], 20);
    expect(scenes.every((s) => s.end - s.start <= 1 + 1e-9)).toBe(true);
    const frameAt = (t: number) => scenes.find((s) => s.start <= t && t < s.end)!.frame;
    expect(frameAt(8.4)).toBe(0);
    expect(frameAt(8.6)).toBe(1);
  });

  it('shows each caption while spoken and briefly after, and the title at the start', () => {
    const scenes = planScenes(frames, [seg(4, 6, 'Click save.'), seg(6.5, 7, '  ')], 20);
    const at = (t: number) => scenes.find((s) => s.start <= t && t < s.end)!;
    expect(at(1).title).toBe(true);
    expect(at(TITLE_SEC + 0.1).title).toBe(false);
    expect(at(3.9).caption).toBe(-1);
    expect(at(5).caption).toBe(0);
    expect(at(7).caption).toBe(0); // held 1.5 s after the end
    expect(at(8).caption).toBe(-1);
  });

  it('returns nothing without frames or length', () => {
    expect(planScenes([], [], 10)).toEqual([]);
    expect(planScenes(frames, [], 0)).toEqual([]);
  });
});

describe('wrapLines', () => {
  const measure = (text: string) => text.length;

  it('wraps on words', () => {
    expect(wrapLines('aa bb cc', 5, measure, 3)).toEqual(['aa bb', 'cc']);
    expect(wrapLines('  ', 5, measure)).toEqual([]);
  });

  it('keeps the latest words when there are too many lines', () => {
    expect(wrapLines('aa bb cc dd ee ff', 5, measure, 2)).toEqual(['…cc dd', 'ee ff']);
  });
});
