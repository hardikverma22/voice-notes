import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Serves model downloads (Hugging Face) and the runtimes on jsdelivr (ONNX, Tesseract) from a
 * disk cache, so the 80+ MB speech model is fetched once rather than in every test's fresh
 * browser profile. The app still makes every request and reads every byte as usual; only the
 * network round trip is skipped. CI keeps the folder between runs.
 *
 * Specs that test network behaviour itself (offline.spec) import from @playwright/test instead.
 */

export const CACHE_DIR = process.env.E2E_NET_CACHE ?? '.cache/e2e-net';
const CACHED = /^https:\/\/(huggingface\.co|[^/]*\.hf\.co|cdn\.jsdelivr\.net)\//;

interface Entry {
  status: number;
  headers: Record<string, string>;
}

function keyFor(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export const test = base.extend<{ netCache: void }>({
  netCache: [
    async ({ context }, use) => {
      await mkdir(CACHE_DIR, { recursive: true });
      await context.route(CACHED, async (route) => {
        const request = route.request();
        if (request.method() !== 'GET' || request.headers()['range']) return route.continue();
        const path = join(CACHE_DIR, keyFor(request.url()));
        try {
          const entry = JSON.parse(await readFile(`${path}.json`, 'utf8')) as Entry;
          return await route.fulfill({
            status: entry.status,
            headers: entry.headers,
            body: await readFile(path),
          });
        } catch {
          // Not cached yet: fetch it, keep it if it is a complete, successful response.
        }
        const response = await route.fetch();
        const body = await response.body();
        if (response.status() === 200) {
          const headers = { ...response.headers() };
          // The body is stored decoded; the browser must not try to decode it again.
          delete headers['content-encoding'];
          headers['content-length'] = String(body.length);
          // Write then rename, so a test killed mid-write never leaves half a model behind.
          await writeFile(`${path}.tmp`, body);
          await rename(`${path}.tmp`, path);
          await writeFile(`${path}.json`, JSON.stringify({ status: 200, headers } satisfies Entry));
          return route.fulfill({ status: 200, headers, body });
        }
        return route.fulfill({ response, body });
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from '@playwright/test';
