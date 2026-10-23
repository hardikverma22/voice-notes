import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ensureModelReady } from './helpers';

test.describe('import', () => {
  test.skip(!existsSync('tests/fixtures/speech.wav'), 'needs macOS say to generate speech.wav');

  test('imports an audio file as a note and transcribes it', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('complementary', { name: 'Notes' })
      .getByRole('button', { name: 'Import' })
      .click();
    await (await chooser).setFiles('tests/fixtures/speech.wav');

    await expect(page).toHaveURL(/#\/note\//);
    await expect(page.locator('#note-title')).toHaveValue('speech');
    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toContainText(/quick brown fox/i, { timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Play recording' })).toBeVisible();
  });

  test('rejects a file that is not audio', async ({ page }) => {
    await page.goto('/');
    const chooser = page.waitForEvent('filechooser');
    await page
      .getByRole('complementary', { name: 'Notes' })
      .getByRole('button', { name: 'Import' })
      .click();
    await (
      await chooser
    ).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(page.getByText('Those are not audio or video files.')).toBeVisible();
  });
});
