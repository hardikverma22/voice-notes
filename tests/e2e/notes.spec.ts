import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ensureModelReady } from './helpers';

test('record, reload, list, delete with undo, and permanent delete', async ({ page }) => {
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Stop recording' }).click();

  // Lands on the note page after saving.
  await expect(page).toHaveURL(/#\/note\//, { timeout: 120_000 });
  const noteUrl = page.url();
  await expect(page.getByRole('region', { name: 'Transcript', exact: true })).toContainText(/fox/i);

  // Reload keeps the note and its audio.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Transcript', exact: true })).toContainText(/fox/i);
  const duration = await page.locator('audio[aria-label="Recording"]').evaluate(async (el) => {
    const audio = el as HTMLAudioElement;
    if (audio.readyState < 1) {
      await new Promise((resolve) =>
        audio.addEventListener('loadedmetadata', resolve, { once: true }),
      );
    }
    if (audio.duration === Infinity) {
      audio.currentTime = 1e9;
      await new Promise((resolve) => audio.addEventListener('timeupdate', resolve, { once: true }));
      audio.currentTime = 0;
    }
    return audio.duration;
  });
  expect(duration === Infinity || duration > 0).toBe(true);

  // The list shows the note.
  await page.goto('/');
  const list = page.getByRole('list', { name: 'Notes' });
  await expect(list.getByRole('link')).toHaveCount(1);

  // Delete, undo: the note comes back.
  await page.goto(noteUrl);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('status')).toContainText('Note deleted');
  await page.getByRole('button', { name: 'Undo' }).click();
  // The list is live, so wait for the restored note without reloading.
  await expect(list.getByRole('link')).toHaveCount(1);

  // Delete and let the toast expire: the note is gone after a reload.
  await page.goto(noteUrl);
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('status')).toContainText('Note deleted');
  await page.waitForTimeout(7000);
  await page.reload();
  await expect(page.getByText('No notes yet')).toBeVisible();
});

test('offers to keep audio from a recording interrupted by a reload', async ({ page }) => {
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(3000);
  await page.reload();

  const toast = page.getByRole('status');
  await expect(toast).toContainText('Recovered an unsaved recording');
  await toast.getByRole('button', { name: 'Keep' }).click();
  await expect(page.getByRole('list', { name: 'Notes' }).getByRole('link')).toHaveCount(1, {
    timeout: 20_000,
  });
});

test('edits autosave and export downloads with the edited text', async ({ page }) => {
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page).toHaveURL(/#\/note\//, { timeout: 120_000 });

  const editor = page.getByRole('textbox', { name: 'Note text' });
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Edited.');
  await page.waitForTimeout(1000);

  await page.reload();
  await expect(page.getByRole('region', { name: 'Transcript', exact: true })).toContainText(
    'Edited.',
  );

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export .md' }).click(),
  ]);
  expect(download.suggestedFilename().endsWith('.md')).toBe(true);
  const path = await download.path();
  expect(path).toBeTruthy();
  const content = readFileSync(path!, 'utf8');
  expect(content).toContain('Edited.');
});
