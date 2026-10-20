/** Growable Float32 sample buffer. Capacity doubles when full. */
export class PcmBuffer {
  private data: Float32Array;
  private size = 0;

  constructor(initialCapacity = 16_000 * 30) {
    this.data = new Float32Array(initialCapacity);
  }

  get length(): number {
    return this.size;
  }

  append(samples: Float32Array): void {
    const needed = this.size + samples.length;
    if (needed > this.data.length) {
      let capacity = this.data.length;
      while (capacity < needed) capacity *= 2;
      const next = new Float32Array(capacity);
      next.set(this.data.subarray(0, this.size), 0);
      this.data = next;
    }
    this.data.set(samples, this.size);
    this.size = needed;
  }

  /** Copy of samples in [start, end), clamped to the buffer. */
  slice(start: number, end: number): Float32Array {
    const s = Math.min(Math.max(0, Math.trunc(start)), this.size);
    const e = Math.min(Math.max(s, Math.trunc(end)), this.size);
    return this.data.slice(s, e);
  }

  toFloat32Array(): Float32Array {
    return this.data.slice(0, this.size);
  }

  durationSec(sampleRate = 16_000): number {
    return this.size / sampleRate;
  }
}
