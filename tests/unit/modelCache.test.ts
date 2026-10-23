import { afterEach, describe, expect, it, vi } from 'vitest';
import { listCachedModels } from '../../src/features/transcribe/modelCache';

function fakeCaches(entries: { url: string; response: Response }[]) {
  const cache = {
    keys: async () => entries.map((e) => new Request(e.url)),
    match: async (request: Request) => entries.find((e) => e.url === request.url)?.response.clone(),
  };
  vi.stubGlobal('caches', {
    has: async () => true,
    open: async () => cache,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('listCachedModels', () => {
  it('sizes a compressed file by its stored body, not the transfer size', async () => {
    const body = new Uint8Array(26_900_000);
    fakeCaches([
      {
        url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1/dist/ort-wasm-simd-threaded.asyncify.wasm',
        response: new Response(body, {
          headers: { 'content-length': '5600000', 'content-encoding': 'gzip' },
        }),
      },
    ]);
    const engine = (await listCachedModels())[0];
    expect(engine).toMatchObject({ name: 'Engine files', removable: false });
    expect(engine?.bytes).toBe(26_900_000);
  });

  it('uses content-length for an uncompressed model file and groups by model', async () => {
    fakeCaches([
      {
        url: 'https://huggingface.co/onnx-community/whisper-base/resolve/main/onnx/encoder_model.onnx',
        response: new Response(new Uint8Array(10), { headers: { 'content-length': '82500000' } }),
      },
      {
        url: 'https://huggingface.co/onnx-community/whisper-base/resolve/main/tokenizer.json',
        response: new Response(new Uint8Array(10), { headers: { 'content-length': '2500000' } }),
      },
    ]);
    const models = await listCachedModels();
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ id: 'onnx-community/whisper-base', removable: true });
    expect(models[0]?.bytes).toBe(85_000_000);
  });
});
