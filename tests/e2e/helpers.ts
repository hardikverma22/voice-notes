import { expect, type Page } from '@playwright/test';

export const SEEDED_NOTE_ID = 'a11y-note';

/** Downloads the model if the page asks for it, then waits until it reports ready. */
export async function ensureModelReady(page: Page): Promise<void> {
  const download = page.getByRole('button', { name: 'Download model' });
  const ready = page.getByText(/^Ready\. Running on/);
  await expect(download.or(ready)).toBeVisible({ timeout: 30_000 });
  if (await download.isVisible()) await download.click();
  await expect(ready).toBeVisible({ timeout: 150_000 });
}

/** Writes one note straight into IndexedDB so the note page can be checked without recording. */
export async function seedNote(page: Page): Promise<void> {
  await page.evaluate(async (id) => {
    const open = indexedDB.open('voice-notes');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const now = Date.now();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('notes', 'readwrite');
      tx.objectStore('notes').put({
        id,
        title: 'Seeded note',
        contentJson: JSON.stringify({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Accessibility check.' }] },
          ],
        }),
        plainText: 'Accessibility check.',
        segments: [],
        audioId: null,
        durationMs: 1000,
        language: 'english',
        modelId: 'seed',
        device: 'wasm',
        createdAt: now,
        updatedAt: now,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, SEEDED_NOTE_ID);
}
