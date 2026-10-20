import { SAMPLE_RATE } from '../transcribe/config';

/** Decodes a stored recording to 16 kHz mono PCM. The decoder resamples to the context rate. */
export async function decodeToPcm16k(blob: Blob): Promise<Float32Array> {
  const context = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buffer = await context.decodeAudioData(await blob.arrayBuffer());
  const length = buffer.length;
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const mixed = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++)
      mixed[i] = (mixed[i] ?? 0) + (data[i] ?? 0) / buffer.numberOfChannels;
  }
  return mixed;
}

/** Peak level per bar, normalised to 0..1, for drawing a static waveform. */
export function computePeaks(pcm: Float32Array, bars: number): number[] {
  if (pcm.length === 0) return new Array<number>(bars).fill(0);
  const size = Math.max(1, Math.floor(pcm.length / bars));
  const peaks: number[] = [];
  let max = 0;
  for (let bar = 0; bar < bars; bar++) {
    let sum = 0;
    const start = bar * size;
    const end = Math.min(pcm.length, start + size);
    for (let i = start; i < end; i++) {
      const v = pcm[i] ?? 0;
      sum += v * v;
    }
    const rms = end > start ? Math.sqrt(sum / (end - start)) : 0;
    peaks.push(rms);
    if (rms > max) max = rms;
  }
  return peaks.map((value) => (max > 0 ? Math.max(0.04, value / max) : 0.04));
}
