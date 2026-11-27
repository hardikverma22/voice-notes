import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from './fixtures';

const NOTE_ID = 'read-aloud-note';
const LINES = [
  'Plan for Friday',
  'Check the build before lunch.',
  'Send the release notes to the team.',
  'Book a room for the demo.',
];

/** A typed note with a heading-like first line and three sentences. */
async function seedTextNote(page: Page, language = 'english'): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ id, title, lines, language }) => {
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
          title,
          contentJson: JSON.stringify({
            type: 'doc',
            content: lines.map((text) => ({
              type: 'paragraph',
              content: [{ type: 'text', text }],
            })),
          }),
          plainText: lines.join('\n\n'),
          segments: [],
          audioId: null,
          durationMs: 0,
          language,
          modelId: 'seed',
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
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    language === 'english'
      ? { id: NOTE_ID, title: 'Friday', lines: LINES, language }
      : { id: NOTE_ID, title: 'नोट', lines: ['नमस्ते दुनिया'], language },
  );
  await page.goto(`/#/note/${NOTE_ID}`);
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeVisible();
}

/** Counts audio buffers handed to the speakers, so the test knows sound was really scheduled. */
async function countScheduledAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __spoken: number[] };
    w.__spoken = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      w.__spoken.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
  });
}
const spoken = (page: Page) =>
  page.evaluate(() => (window as unknown as { __spoken: number[] }).__spoken);

test('reads a note aloud with pause, skip, voice change and stop', async ({ page }) => {
  await countScheduledAudio(page);
  await seedTextNote(page);

  await page.getByRole('button', { name: 'Read aloud' }).click();
  const panel = page.getByRole('region', { name: 'Read aloud' });
  await expect(panel).toBeVisible();
  // Title, then each line: 5 sentences. The first is the title, read with a full stop.
  await expect(panel.getByText(/Sentence 1 of 5/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('read-aloud-sentence')).toHaveText('Friday.');
  await expect(panel.getByText(/Sentence 2 of 5/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('read-aloud-sentence')).toHaveText('Plan for Friday.');

  // Several sentences are made ahead of the playhead, each one real audio.
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThanOrEqual(3);
  for (const seconds of await spoken(page)) expect(seconds).toBeGreaterThan(0.3);

  // Pause holds the sentence; resume carries on.
  await page.getByRole('button', { name: 'Pause reading' }).click();
  await expect(panel.getByText(/Paused · Sentence/)).toBeVisible();
  const held = await page.getByTestId('read-aloud-sentence').textContent();
  await page.waitForTimeout(2500);
  await expect(page.getByTestId('read-aloud-sentence')).toHaveText(held ?? '');
  await page.getByRole('button', { name: 'Resume reading' }).click();
  await expect(panel.getByText(/Paused/)).toHaveCount(0);

  // Skip to the last sentence.
  for (let i = 0; i < 4; i++) {
    const next = page.getByRole('button', { name: 'Next sentence' });
    if (await next.isDisabled()) break;
    await next.click();
  }
  await expect(page.getByTestId('read-aloud-sentence')).toHaveText('Book a room for the demo.');
  await expect(page.getByRole('button', { name: 'Next sentence' })).toBeDisabled();

  // A new voice restarts the current sentence with it, and is remembered.
  const before = (await spoken(page)).length;
  await panel.getByRole('combobox', { name: 'Voice' }).selectOption('M2');
  await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(before);
  expect(await page.evaluate(() => localStorage.getItem('vn-speech'))).toContain('M2');

  // The end of the note closes the player on its own.
  await expect(panel).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Read aloud' })).toBeVisible();

  // Start again and stop from the toolbar.
  await page.getByRole('button', { name: 'Read aloud' }).click();
  await expect(panel.getByText(/Sentence 1 of 5/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop reading' }).first().click();
  await expect(panel).toBeHidden();
});

test('saves the note as spoken audio, and lists the voice model in Settings', async ({ page }) => {
  await seedTextNote(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('menuitem', { name: /Download spoken audio/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^friday-\d{4}-\d{2}-\d{2}-spoken\.wav$/);
  const bytes = await readFile((await file.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('RIFF');
  expect(bytes.readUInt32LE(24)).toBe(24_000);
  const seconds = (bytes.length - 44) / 2 / 24_000;
  expect(seconds).toBeGreaterThan(4);
  expect(seconds).toBeLessThan(30);
  await expect(page.getByText('Spoken audio saved.')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Reading notes aloud')).toBeVisible({ timeout: 10_000 });
});

test('says so when a note has nothing English to read', async ({ page }) => {
  await seedTextNote(page, 'hindi');
  await page.getByRole('button', { name: 'Read aloud' }).click();
  await expect(page.getByText('Text in other languages may be skipped')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'English text only' })).toBeVisible({
    timeout: 60_000,
  });
});
