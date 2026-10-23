import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import {
  ensureModelReady,
  SEEDED_NOTE_ID,
  seedNote,
  sidebarNotes,
  stopAndOpenNote,
} from './helpers';

test('tags a note, suggests existing tags, and filters the library by tag', async ({ page }) => {
  await page.goto('/');
  await seedNote(page);
  await page.goto(`/#/note/${SEEDED_NOTE_ID}`);
  // The seed writes behind the app's back; reload so the library reads it.
  await page.reload();

  await page.getByRole('button', { name: 'Add tag' }).click();
  const input = page.getByRole('combobox', { name: 'Add a tag' });
  await input.fill('Work');
  await input.press('Enter');
  await input.fill('#ideas,');
  await input.press('Escape');
  const tags = page.getByRole('group', { name: 'Tags' });
  await expect(tags.getByRole('button', { name: 'Remove tag Work' })).toBeVisible();
  await expect(tags.getByRole('button', { name: 'Remove tag ideas' })).toBeVisible();

  const filter = page.getByRole('group', { name: 'Filter by tag' });
  await filter.getByRole('button', { name: 'Work' }).click();
  await expect(sidebarNotes(page)).toHaveCount(1);
  await expect(filter.getByRole('button', { name: 'Work' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await tags.getByRole('button', { name: 'Remove tag Work' }).click();
  await expect(filter.getByRole('button', { name: 'Work' })).toHaveCount(0);
  await expect(filter.getByRole('button', { name: 'ideas' })).toBeVisible();
});

test.describe('record more', () => {
  test.skip(!existsSync('tests/fixtures/speech.wav'), 'needs macOS say to generate speech.wav');

  test('adds a recording to the end of a note with a marked moment', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.waitForTimeout(4000);
    await stopAndOpenNote(page);

    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toContainText(/fox/i, { timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Record more' })).toBeEnabled();

    await page.getByRole('button', { name: 'Record more' }).click();
    const panel = page.getByRole('region', { name: 'Recording more for this note' });
    await expect(panel).toBeVisible();
    await page.waitForTimeout(1500);
    await panel.getByRole('button', { name: /Mark moment/ }).click();
    await page.waitForTimeout(2500);
    await panel.getByRole('button', { name: 'Stop and add' }).click();

    await expect(page.getByText('Added to this note').first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => ((await editor.textContent()) ?? '').match(/fox/gi)?.length ?? 0, {
        timeout: 120_000,
      })
      .toBeGreaterThanOrEqual(2);

    const bookmarks = page.getByRole('region', { name: /^Marked moments/ });
    await expect(bookmarks.getByRole('textbox', { name: /Label for moment/ })).toHaveCount(1);
    await bookmarks.getByRole('textbox', { name: /Label for moment/ }).fill('Second take');
    await bookmarks.getByRole('textbox', { name: /Label for moment/ }).press('Enter');
    await expect(bookmarks.getByRole('textbox', { name: /Label for moment/ })).toHaveValue(
      'Second take',
    );
    // Segments from the added audio come after the first recording's on the timeline.
    await page.getByRole('tab', { name: 'Timestamps' }).click();
    expect(await page.getByRole('button', { name: /fox/i }).count()).toBeGreaterThanOrEqual(2);
  });
});

test('sidebar row menu renames, and deletes with undo; right-click opens it too', async ({
  page,
}) => {
  await page.goto('/');
  await seedNote(page);
  await page.goto(`/#/note/${SEEDED_NOTE_ID}`);
  await page.reload();

  const row = sidebarNotes(page).first();
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const field = page.getByRole('textbox', { name: 'Note title' });
  await field.fill('Renamed from sidebar');
  await field.press('Enter');
  await expect(sidebarNotes(page).first()).toContainText('Renamed from sidebar');
  await expect(page.locator('#note-title')).toHaveValue('Renamed from sidebar');

  await page.getByRole('button', { name: 'Actions for Renamed from sidebar' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(sidebarNotes(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sidebarNotes(page)).toHaveCount(1);
});
