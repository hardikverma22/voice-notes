/**
 * Decides when the shared screen has changed enough to keep a new frame. The screen is sampled
 * as a tiny grayscale thumbnail; a frame is kept once it differs from the last kept frame and
 * has stopped moving, so a scroll or an animation is captured where it lands, not midway.
 */

export const SIGNATURE_WIDTH = 32;
export const SIGNATURE_HEIGHT = 18;

/** Mean difference, 0..1, above which the screen counts as changed. */
export const CHANGE_THRESHOLD = 0.045;
/** Below this difference between two samples in a row, the screen counts as still. */
export const STILL_THRESHOLD = 0.012;
/** Auto frames are at least this far apart. */
export const MIN_GAP_MS = 2500;

/** Grayscale thumbnail of RGBA pixels, one byte per pixel. */
export function signature(rgba: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(rgba.length / 4);
  for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
    out[p] = (rgba[i]! * 299 + rgba[i + 1]! * 587 + rgba[i + 2]! * 114) / 1000;
  }
  return out;
}

/** Mean absolute difference of two signatures, 0 (same) to 1 (inverted). */
export function difference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / (a.length * 255);
}

export interface SceneState {
  /** Signature of the last kept frame. */
  kept: Uint8Array | null;
  keptAt: number;
  /** Signature of the previous sample. */
  previous: Uint8Array | null;
}

export function initialScene(): SceneState {
  return { kept: null, keptAt: -Infinity, previous: null };
}

/** Feeds one sample; returns whether to keep it as a frame, and the next state. */
export function observe(
  state: SceneState,
  sample: Uint8Array,
  now: number,
): { keep: boolean; state: SceneState } {
  const still = state.previous !== null && difference(state.previous, sample) < STILL_THRESHOLD;
  const changed = state.kept === null || difference(state.kept, sample) > CHANGE_THRESHOLD;
  const keep = changed && still && now - state.keptAt >= MIN_GAP_MS;
  return {
    keep,
    state: keep ? { kept: sample, keptAt: now, previous: sample } : { ...state, previous: sample },
  };
}

/** Records that a frame was kept by hand, so the same picture is not kept again. */
export function keptManually(sample: Uint8Array, now: number): SceneState {
  return { kept: sample, keptAt: now, previous: sample };
}
