/** Types for the vendored plain-JavaScript tiny-voca model (see README.md in this folder). */
export interface GGUFFile {
  meta: Record<string, unknown>;
  tensors: Record<string, { shape: number[]; type: number; data: Float32Array }>;
  files: Record<string, Uint8Array>;
}

export function readGGUF(buffer: ArrayBuffer): GGUFFile;

export interface TinyVocaConfig {
  sample_rate: number;
  max_tokens: number;
  speakers: string[];
}

export interface SynthesizeOptions {
  voice?: string | number;
  /** Speaking rate: durations are divided by it, so pitch is kept. */
  speed?: number;
  pitchShift?: number;
  pitchRange?: number;
  seed?: number;
}

export class TinyVoca {
  constructor(file: GGUFFile);
  config: TinyVocaConfig;
  voices: string[];
  synthesize(
    ids: ArrayLike<number>,
    stress: ArrayLike<number>,
    options?: SynthesizeOptions,
  ): { audio: Float32Array; durations: Int32Array | number[]; f0: Float32Array };
}
