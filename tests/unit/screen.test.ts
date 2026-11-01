import { describe, expect, it } from 'vitest';
import {
  CHANGE_THRESHOLD,
  MIN_GAP_MS,
  difference,
  initialScene,
  observe,
  signature,
} from '../../src/features/screen/sceneChange';
import { isNegligible, strokePath, thin } from '../../src/features/screen/annotation';
import { frameAt, pairSpeech } from '../../src/features/screen/timeline';
import { fitWithin } from '../../src/features/screen/screenCapture';
import type { Stroke } from '../../src/storage/db';

const flat = (value: number, size = 16) => new Uint8Array(size).fill(value);

describe('scene change', () => {
  it('turns RGBA into one luma byte per pixel', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    expect([...signature(rgba)]).toEqual([255, 0]);
  });

  it('measures difference from 0 to 1', () => {
    expect(difference(flat(10), flat(10))).toBe(0);
    expect(difference(flat(0), flat(255))).toBe(1);
    expect(difference(flat(0, 4), flat(0, 8))).toBe(1);
  });

  it('keeps the first frame only once the screen holds still', () => {
    let state = initialScene();
    let result = observe(state, flat(100), 0);
    expect(result.keep).toBe(false); // no previous sample: cannot tell it is still
    state = result.state;
    result = observe(state, flat(100), 700);
    expect(result.keep).toBe(true);
  });

  it('waits for a change to settle, then keeps where it landed', () => {
    let state = observe(observe(initialScene(), flat(100), 0).state, flat(100), 700).state;
    const t = 700 + MIN_GAP_MS;
    // Scrolling: changes every sample, so nothing is kept.
    let result = observe(state, flat(140), t);
    expect(result.keep).toBe(false);
    state = result.state;
    result = observe(state, flat(180), t + 700);
    expect(result.keep).toBe(false);
    state = result.state;
    // Stopped: kept.
    result = observe(state, flat(180), t + 1400);
    expect(result.keep).toBe(true);
  });

  it('ignores small changes such as a blinking cursor', () => {
    const state = observe(observe(initialScene(), flat(100), 0).state, flat(100), 700).state;
    const tiny = flat(100);
    tiny[0] = 100 + Math.floor(CHANGE_THRESHOLD * 255 * 16) - 1;
    const settled = observe(observe(state, tiny, 5000).state, tiny, 5700);
    expect(settled.keep).toBe(false);
  });

  it('respects the minimum gap between auto frames', () => {
    const state = observe(observe(initialScene(), flat(100), 0).state, flat(100), 700).state;
    const soon = observe(observe(state, flat(200), 800).state, flat(200), 900);
    expect(soon.keep).toBe(false);
  });
});

describe('fitWithin', () => {
  it('shrinks large captures and leaves small ones', () => {
    expect(fitWithin(3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});

describe('annotation geometry', () => {
  const stroke = (tool: Stroke['tool'], points: [number, number][]): Stroke => ({
    id: 'x',
    tool,
    color: '#f00',
    points,
  });

  it('draws a box between two corners', () => {
    expect(
      strokePath(
        stroke('box', [
          [0.1, 0.1],
          [0.5, 0.5],
        ]),
        100,
        100,
      ),
    ).toBe('M10 10H50V50H10Z');
  });

  it('draws an arrow with a head at the end point', () => {
    const d = strokePath(
      stroke('arrow', [
        [0, 0],
        [1, 0],
      ]),
      100,
      100,
    );
    expect(d.startsWith('M0 0L100 0M')).toBe(true);
    // Head: two short lines that meet at the tip, behind it and on either side of the shaft.
    const [, head] = d.split('M0 0L100 0');
    const [a, , b] = head!
      .slice(1)
      .split('L')
      .map((p) => p.split(' ').map(Number));
    expect(a![0]).toBeLessThan(100);
    expect(b![0]).toBe(a![0]);
    expect(a![1]).toBe(-b![1]!);
  });

  it('draws a smooth pen curve through the points', () => {
    const d = strokePath(
      stroke('pen', [
        [0, 0],
        [0.5, 0.5],
        [1, 0],
      ]),
      100,
      100,
    );
    expect(d).toBe('M0 0Q50 50 75 25L100 0');
  });

  it('thins points that are too close, keeping both ends', () => {
    const points: [number, number][] = [
      [0, 0],
      [0.0001, 0],
      [0.0002, 0],
      [0.5, 0],
      [0.5001, 0],
    ];
    expect(thin(points)).toEqual([
      [0, 0],
      [0.5, 0],
      [0.5001, 0],
    ]);
  });

  it('treats a click with the arrow or box as nothing', () => {
    expect(
      isNegligible(
        stroke('arrow', [
          [0.2, 0.2],
          [0.2, 0.2],
        ]),
      ),
    ).toBe(true);
    expect(
      isNegligible(
        stroke('box', [
          [0.2, 0.2],
          [0.4, 0.3],
        ]),
      ),
    ).toBe(false);
    expect(isNegligible(stroke('pen', [[0.2, 0.2]]))).toBe(false);
  });
});

describe('timeline', () => {
  const seg = (start: number, text: string) => ({ start, end: start + 1, text });
  const frames = [{ t: 0 }, { t: 10 }, { t: 20 }];

  it('gives each frame the speech until the next frame, with a short lead', () => {
    const paired = pairSpeech(frames, [
      seg(1, 'Open the page.'),
      seg(9, 'Now click save.'), // 1 s before the second frame: belongs to it
      seg(12, 'It spins.'),
      seg(25, 'And then it fails.'),
    ]);
    expect(paired.map((p) => p.text)).toEqual([
      'Open the page.',
      'Now click save. It spins.',
      'And then it fails.',
    ]);
  });

  it('gives speech before the first frame to the first frame', () => {
    const paired = pairSpeech([{ t: 5 }], [seg(0, 'Hello.'), seg(1, '  ')]);
    expect(paired[0]!.text).toBe('Hello.');
    expect(paired[0]!.segments).toHaveLength(1);
  });

  it('finds the frame on screen at a time', () => {
    expect(frameAt(frames, -1)).toBe(-1);
    expect(frameAt(frames, 0)).toBe(0);
    expect(frameAt(frames, 15)).toBe(1);
    expect(frameAt(frames, 99)).toBe(2);
  });
});
