import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { modelChip, stopAndOpenNote } from './helpers';

test.describe('transcription', () => {
  test.skip(!existsSync('tests/fixtures/speech.wav'), 'needs macOS say to generate speech.wav');

  test('first recording downloads the model with progress, then transcribes', async ({ page }) => {
    await page.goto('/');
    await expect(modelChip(page)).toHaveAttribute('aria-label', /not downloaded/, {
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByRole('progressbar', { name: 'Speech model download' })).toBeVisible();

    const live = page.getByRole('region', { name: 'Live transcript' });
    await expect(live).toContainText(/fox/i, { timeout: 150_000 });

    await stopAndOpenNote(page);
    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toContainText(/quick brown fox/i, { timeout: 120_000 });
    await expect(editor).toContainText(/lazy dog/i);
    await expect(page.getByRole('tab', { name: 'Timestamps' })).toBeVisible();
  });
});
