import { expect, type Page } from '@playwright/test';

export const SEEDED_NOTE_ID = 'a11y-note';

/** The header chip names the model state, e.g. "Speech model: On-device · CPU. Open settings". */
export function modelChip(page: Page) {
  return page.getByRole('button', { name: /^Speech model:/ });
}

/** Downloads the model from Settings if needed, then waits until the chip reports it ready. */
export async function ensureModelReady(page: Page): Promise<void> {
  const chip = modelChip(page);
  await expect(chip).toBeVisible({ timeout: 30_000 });
  const label = (await chip.getAttribute('aria-label')) ?? '';
  if (label.includes('not downloaded')) {
    await chip.click();
    await page.getByRole('button', { name: 'Download now' }).click();
    await page.getByRole('button', { name: 'Close' }).click();
  }
  await expect(chip).toHaveAttribute('aria-label', /On-device/, { timeout: 150_000 });
}

/** Stops the running recording and opens the saved note from the confirmation card. */
export async function stopAndOpenNote(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByText('Saved to your notes').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Open note' }).click();
  await expect(page).toHaveURL(/#\/note\//);
}

/** Note links in the desktop sidebar. */
export function sidebarNotes(page: Page) {
  return page.getByRole('complementary', { name: 'Notes' }).locator('a[href^="#/note/"]');
}

/** Opens the note's "More actions" menu and picks an item. */
export async function noteMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: item }).click();
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
        pinned: false,
        status: 'ready',
        autoTitle: false,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, SEEDED_NOTE_ID);
}
