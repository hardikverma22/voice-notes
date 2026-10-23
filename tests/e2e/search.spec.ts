import { expect, test, type Page } from '@playwright/test';
import { sidebarNotes } from './helpers';

const NOTES = [
  ['Dentist', 'Dentist appointment moved to Thursday at four, need to leave work early.'],
  ['Groceries', 'Groceries: oat milk, eggs, spinach, and the good coffee beans.'],
  ['Knee', 'Run felt heavy today, knee hurt after five kilometres, maybe rest until Sunday.'],
  ['Physio', 'Physio said the knee pain is from weak hips, do clamshells and bridges weekly.'],
  // Related notes need eight or more notes, so the library average is a fair baseline.
  ['Insurance', 'Car insurance renews next month, compare three quotes before it rolls over.'],
  ['Story idea', 'A lighthouse keeper records the sea every night until a voice answers back.'],
  ['Boiler', 'The landlord says the boiler gets serviced on Tuesday morning, someone must be home.'],
  ['Spanish', 'Twenty minutes of Spanish every morning, podcast for listening and flashcards.'],
  ['Subscriptions', 'Subscriptions crept up to sixty a month, cancel the second streaming service.'],
] as const;

async function seedNotes(page: Page) {
  await page.evaluate(async (notes) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('voice-notes');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const tx = db.transaction('notes', 'readwrite');
    const now = Date.now();
    notes.forEach(([title, text], i) =>
      tx.objectStore('notes').put({
        id: `search-${i}`,
        title,
        contentJson: JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
        }),
        plainText: text,
        segments: [],
        audioId: null,
        durationMs: 0,
        language: 'english',
        modelId: 'seed',
        device: 'wasm',
        createdAt: now - i * 1000,
        updatedAt: now - i * 1000,
        pinned: false,
        status: 'ready',
        autoTitle: false,
        tags: [],
        bookmarks: [],
        pendingAppend: null,
      }),
    );
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  }, NOTES);
}

test('finds notes by meaning after turning it on, and suggests related notes', async ({ page }) => {
  await page.goto('/');
  await seedNotes(page);
  await page.reload();
  await expect(sidebarNotes(page)).toHaveCount(NOTES.length);

  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill('when is my teeth check-up');
  await expect(page.getByText('No notes contain')).toBeVisible();
  await page.getByRole('button', { name: 'Turn on' }).click();

  const meaning = page.getByRole('region', { name: 'Similar meaning' });
  await expect(meaning.getByRole('link', { name: /Dentist/ })).toBeVisible({ timeout: 120_000 });
  await expect(meaning.getByRole('link')).toHaveCount(1);
  // The result list fades in; it must finish fully visible.
  await expect(meaning.getByRole('list')).toHaveCSS('opacity', '1');

  await search.fill('injury while jogging');
  await expect(meaning.getByRole('link', { name: /Knee/ })).toBeVisible();
  await expect(meaning.getByRole('link', { name: /Dentist/ })).toHaveCount(0);
  await expect(meaning.getByRole('list')).toHaveCSS('opacity', '1');

  await page.goto('/#/note/search-2');
  const related = page.getByRole('region', { name: 'Related notes' });
  await expect(related.getByRole('link', { name: /Physio/ })).toBeVisible({ timeout: 30_000 });
  await expect(related.getByRole('link', { name: /Groceries|Dentist/ })).toHaveCount(0);
});
