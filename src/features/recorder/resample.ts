export interface StreamingResampler {
  push(input: Float32Array): Float32Array;
}

/**
 * Stateful linear-interpolation resampler. Pushing a signal in pieces gives the same
 * output as pushing it whole. For downsampling ratios above 2, a moving-average
 * pre-filter (also stateful) reduces aliasing first.
 */
export function createStreamingResampler(
  inputRate: number,
  outputRate = 16_000,
): StreamingResampler {
  if (inputRate === outputRate) {
    return { push: (input) => input.slice() };
  }

  const ratio = inputRate / outputRate;
  const filterWidth = ratio > 2 ? Math.round(ratio) : 1;
  let history = new Float32Array(Math.max(0, filterWidth - 1)); // last raw samples for the filter
  let carry = new Float32Array(0); // filtered samples not yet dropped
  let carryStart = 0; // absolute index (in filtered stream) of carry[0]
  let nextPos = 0; // absolute position of the next output sample

  function prefilter(input: Float32Array): Float32Array {
    if (filterWidth === 1) return input;
    const combined = new Float32Array(history.length + input.length);
    combined.set(history, 0);
    combined.set(input, history.length);
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      let sum = 0;
      for (let k = 0; k < filterWidth; k++) sum += combined[i + k] ?? 0;
      out[i] = sum / filterWidth;
    }
    history = combined.slice(combined.length - history.length);
    return out;
  }

  return {
    push(input: Float32Array): Float32Array {
      const filtered = prefilter(input);
      const stream = new Float32Array(carry.length + filtered.length);
      stream.set(carry, 0);
      stream.set(filtered, carry.length);
      const streamEnd = carryStart + stream.length;

      const out: number[] = [];
      while (Math.floor(nextPos) + 1 < streamEnd) {
        const i = Math.floor(nextPos);
        const frac = nextPos - i;
        const a = stream[i - carryStart] ?? 0;
        const b = stream[i + 1 - carryStart] ?? 0;
        out.push(a * (1 - frac) + b * frac);
        nextPos += ratio;
      }

      // nextPos can be past the end of this stream; never drop more samples than we have.
      const cut = Math.min(stream.length, Math.max(0, Math.floor(nextPos) - carryStart));
      carry = stream.slice(cut);
      carryStart += cut;
      return Float32Array.from(out);
    },
  };
}
