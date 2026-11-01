import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

const PAGE = `<!doctype html><html><body style="margin:0;font:28px/1.4 system-ui,sans-serif;background:#fff;color:#111">
  <div style="padding:48px">
    <h1 style="font-size:40px;margin:0 0 24px">Checkout</h1>
    <div style="padding:20px;background:#fdecea;color:#8a1c12;border-radius:8px">Payment failed: card_declined (code 402)</div>
    <p>Total due 86.00 USD</p>
  </div></body></html>`;

test('reads the text in screen frames, then search, the viewer and exports use it', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const shop = await context.newPage();
  await shop.setViewportSize({ width: 1280, height: 720 });
  await shop.setContent(PAGE);
  const shot = (await shop.screenshot({ type: 'png' })).toString('base64');
  await shop.close();

  await page.goto('/');
  await page.evaluate(async (b64) => {
    const open = indexedDB.open('voice-notes');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const now = Date.now();
    const tx = db.transaction(['notes', 'frames'], 'readwrite');
    tx.objectStore('notes').put({
      id: 'ocr-note',
      title: 'Checkout bug',
      contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
      plainText: 'The pay button fails.',
      segments: [],
      audioId: null,
      durationMs: 5000,
      language: 'english',
      modelId: 'demo',
      device: 'wasm',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      status: 'ready',
      autoTitle: false,
      tags: [],
      bookmarks: [],
      pendingAppend: null,
    });
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    tx.objectStore('frames').put({
      id: 'ocr-frame',
      noteId: 'ocr-note',
      sessionId: null,
      t: 1,
      blob: new Blob([bytes], { type: 'image/png' }),
      mimeType: 'image/png',
      width: 1280,
      height: 720,
      source: 'auto',
      strokes: [],
      createdAt: now,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }, shot);
  await page.reload();

  // Search finds a word that is only on screen, and says so.
  const search = page.getByRole('searchbox').first();
  await search.fill('card_declined');
  const row = page.locator('a[href="#/note/ocr-note"]').first();
  await expect(row).toBeVisible({ timeout: 120_000 });
  await expect(row).toContainText('On screen');

  await row.click();
  await page.getByRole('button', { name: /^Mark up/ }).click();
  const viewer = page.getByRole('dialog', { name: /^Frame 1 of 1/ });
  await viewer.getByRole('button', { name: 'Text on screen' }).click();
  const panel = viewer.getByRole('complementary', { name: 'Text on screen' });
  await expect(panel).toContainText('Payment failed');
  await expect(panel).toContainText('402');
  await page.keyboard.press('Escape');

  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export for agent' }).click();
  const files = unzipSync(new Uint8Array(await readFile((await (await downloading).path())!)));
  const md = strFromU8(files['report.md']!);
  expect(md).toContain('Text on screen:');
  expect(md).toMatch(/card.declined/);
});
