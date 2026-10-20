export const MODEL_ID = 'onnx-community/whisper-base';
export const ASR_TASK = 'automatic-speech-recognition';
export const SAMPLE_RATE = 16_000;
/** WebGPU: fp32 encoder + 4-bit decoder (~78 MB + ~117 MB). From the upstream WebGPU Whisper example; verify in M2. */
export const DTYPE_WEBGPU = { encoder_model: 'fp32', decoder_model_merged: 'q4' } as const;
/** WASM: 8-bit both (~22 MB + ~51 MB). Verified: files encoder_model_quantized.onnx + decoder_model_merged_quantized.onnx. */
export const DTYPE_WASM = { encoder_model: 'q8', decoder_model_merged: 'q8' } as const;
export const LANGUAGE = 'english';
export const LIVE_TICK_MS = 2_000;
export const WINDOW_COMMIT_SEC = 20;
export const COMMIT_GUARD_SEC = 3;
export const WINDOW_MAX_SEC = 28;
export const MAX_RECORDING_SEC = 20 * 60;
export const FINAL_CHUNK_LENGTH_S = 30;
export const FINAL_STRIDE_LENGTH_S = 5;
