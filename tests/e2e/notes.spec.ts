import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ensureModelReady, noteMenu, sidebarNotes, stopAndOpenNote } from './helpers';

test('record, reload, list, delete with undo, and permanent delete', async ({ page }) => {
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(4000);
  await stopAndOpenNote(page);
  const noteUrl = page.url();
  const editor = page.getByRole('textbox', { name: 'Note text' });
  await expect(editor).toContainText(/fox/i, { timeout: 120_000 });

  // Reload keeps the note and its audio player.
  await page.reload();
  await expect(editor).toContainText(/fox/i);
  await expect(page.getByRole('button', { name: 'Play recording' })).toBeVisible();

  await expect(sidebarNotes(page)).toHaveCount(1);

  // Delete, undo: the note comes back.
  await noteMenu(page, 'Delete note');
  await expect(page.getByRole('status').filter({ hasText: 'Note deleted' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(sidebarNotes(page)).toHaveCount(1);

  // Delete and let the toast expire: the note is gone after a reload.
  await page.goto(noteUrl);
  await noteMenu(page, 'Delete note');
  await page.waitForTimeout(8000);
  await page.reload();
  await expect(page.getByText('No notes yet').first()).toBeVisible();
});

test('recovers audio from a recording interrupted by a reload', async ({ page }) => {
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(3000);
  await page.reload();

  await expect(page.getByText('Recovered an unsaved recording')).toBeVisible();
  await expect(sidebarNotes(page)).toHaveCount(1, { timeout: 20_000 });
});

test('search filters the library', async ({ page }) => {
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(4000);
  await stopAndOpenNote(page);
  await expect(page.getByRole('textbox', { name: 'Note text' })).toContainText(/fox/i, {
    timeout: 120_000,
  });
  const search = page.getByRole('complementary').getByRole('searchbox', { name: 'Search notes' });
  await search.fill('fox');
  await expect(sidebarNotes(page)).toHaveCount(1);
  await search.fill('zebra');
  await expect(sidebarNotes(page)).toHaveCount(0);
  await expect(page.getByText('No notes contain')).toBeVisible();
});

test('edits autosave and export downloads with the edited text', async ({ page }) => {
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(3000);
  await stopAndOpenNote(page);

  const editor = page.getByRole('textbox', { name: 'Note text' });
  await expect(editor).toHaveAttribute('contenteditable', 'true', { timeout: 120_000 });
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  const saveStatus = page
    .getByRole('main')
    .getByRole('status')
    .filter({ hasText: /^(Saving|Saved)/ });
  await expect(saveStatus).toHaveText(/^Saving/);
  await expect(saveStatus).toHaveText(/^Saved/);

  await page.reload();
  await expect(editor).toContainText('Edited.');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    noteMenu(page, 'Export as Markdown'),
  ]);
  expect(download.suggestedFilename().endsWith('.md')).toBe(true);
  const path = await download.path();
  expect(path).toBeTruthy();
  expect(readFileSync(path!, 'utf8')).toContain('Edited.');
});
