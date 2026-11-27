import { TTS_CACHE, TTS_MODEL_BYTES, TTS_MODEL_URL } from '../features/speak/config';
import type { FromTtsWorker, ToTtsWorker } from '../features/speak/protocol';
import { concat, utterancesOf } from '../features/speak/speechText';
import { readGGUF, TinyVoca } from '../vendor/tiny-voca/tiny-voca.js';
import { fromGGUF, type Phonemizer } from '../vendor/tiny-voca/dizione/engine.js';

// Text to speech with tiny-voca, in plain JavaScript on the CPU. The only importer of
// src/vendor/tiny-voca. One sentence takes a few hundred milliseconds, so it runs here, away
// from the page. Requests are answered in the order they arrive.

function post(message: FromTtsWorker, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

/** The model file from Cache Storage, or downloaded (with progress) and then cached. */
async function modelBytes(): Promise<ArrayBuffer> {
  const cache = typeof caches === 'undefined' ? null : await caches.open(TTS_CACHE);
  const hit = await cache?.match(TTS_MODEL_URL);
  if (hit) return hit.arrayBuffer();

  const response = await fetch(TTS_MODEL_URL);
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status})`);
  const total = Number(response.headers.get('content-length')) || TTS_MODEL_BYTES;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let loaded = 0;
  let lastPost = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.length;
    if (Date.now() - lastPost > 100) {
      lastPost = Date.now();
      post({ type: 'progress', loaded, total });
    }
  }
  const bytes = new Uint8Array(loaded);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  post({ type: 'progress', loaded, total: loaded });
  await cache
    ?.put(
      TTS_MODEL_URL,
      new Response(bytes.slice(), {
        headers: { 'content-type': 'application/octet-stream', 'content-length': String(loaded) },
      }),
    )
    .catch(() => undefined); // Storage full: it still works this visit.
  return bytes.buffer;
}

interface Engine {
  voca: TinyVoca;
  phonemizer: Phonemizer;
}
let enginePromise: Promise<Engine> | null = null;

function engine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const file = readGGUF(await modelBytes());
      const voca = new TinyVoca(file);
      const phonemizer = await fromGGUF(file);
      post({ type: 'ready', sampleRate: voca.config.sample_rate });
      return { voca, phonemizer };
    })();
    enginePromise.catch(() => {
      enginePromise = null;
    });
  }
  return enginePromise;
}

// Messages are handled one at a time: synthesis is synchronous, and awaiting the engine must not
// let a later sentence overtake an earlier one.
let queue: Promise<void> = Promise.resolve();

self.onmessage = (event: MessageEvent<ToTtsWorker>) => {
  const message = event.data;
  queue = queue.then(() => handle(message));
};

async function handle(message: ToTtsWorker): Promise<void> {
  if (message.type === 'load') {
    await engine().catch((error: unknown) =>
      post({ type: 'error', id: null, message: errorText(error) }),
    );
    return;
  }
  try {
    const { voca, phonemizer } = await engine();
    // Upstream leaves 12 ids of room below the model's limit.
    const pieces = utterancesOf(
      message.text,
      (text) => phonemizer.phonemize(text),
      voca.config.max_tokens - 12,
    );
    if (!pieces.length) {
      post({ type: 'audio', id: message.id, audio: null });
      return;
    }
    const audio = concat(
      pieces.map(
        ({ ids, stress }, i) =>
          voca.synthesize(ids, stress, {
            voice: message.voice,
            speed: message.speed,
            seed: message.seed + i,
          }).audio,
      ),
    );
    post({ type: 'audio', id: message.id, audio }, [audio.buffer]);
  } catch (error) {
    post({ type: 'error', id: message.id, message: errorText(error) });
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
