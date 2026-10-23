import { EMBED_MODEL_ID } from '../search/config';
import { ACCURATE_MODEL_ID, MODEL_ID } from './config';

/**
 * Models downloaded by transformers.js live in Cache Storage ("transformers-cache"), one entry
 * per file, with URLs containing the model id. Deleting a model removes only the entries under
 * its own id. The shared engine files (ONNX runtime from the CDN) are shown but kept.
 */

const CACHE = 'transformers-cache';

export interface CachedModel {
  id: string;
  name: string;
  purpose: string;
  bytes: number;
  removable: boolean;
}

const KNOWN: Record<string, { name: string; purpose: string }> = {
  [MODEL_ID]: { name: 'Speech · Fast', purpose: 'Live and final transcripts' },
  [ACCURATE_MODEL_ID]: { name: 'Speech · Accurate', purpose: 'Final transcripts in Accurate mode' },
  [EMBED_MODEL_ID]: { name: 'Search', purpose: 'Search by meaning and related notes' },
};
const RUNTIME = 'runtime';

function modelIdOf(url: string): string {
  const match = /huggingface\.co\/([^/]+\/[^/]+)\//.exec(url);
  return match?.[1] ?? RUNTIME;
}

export async function listCachedModels(): Promise<CachedModel[]> {
  if (typeof caches === 'undefined' || !(await caches.has(CACHE))) return [];
  const cache = await caches.open(CACHE);
  const sizes = new Map<string, number>();
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    const length = Number(response?.headers.get('content-length'));
    const bytes =
      Number.isFinite(length) && length > 0 ? length : ((await response?.blob())?.size ?? 0);
    const id = modelIdOf(request.url);
    sizes.set(id, (sizes.get(id) ?? 0) + bytes);
  }
  return [...sizes]
    .map(([id, bytes]) =>
      id === RUNTIME
        ? { id, name: 'Engine files', purpose: 'Shared by all models', bytes, removable: false }
        : {
            id,
            name: KNOWN[id]?.name ?? id,
            purpose: KNOWN[id]?.purpose ?? 'Not used by this version of the app',
            bytes,
            removable: true,
          },
    )
    .sort((a, b) => Number(b.removable) - Number(a.removable) || b.bytes - a.bytes);
}

/** Deletes one model's files from the browser cache. Returns the number of files removed. */
export async function deleteCachedModel(id: string): Promise<number> {
  if (id === RUNTIME || typeof caches === 'undefined') return 0;
  const cache = await caches.open(CACHE);
  let removed = 0;
  for (const request of await cache.keys()) {
    if (modelIdOf(request.url) === id && (await cache.delete(request))) removed++;
  }
  return removed;
}
