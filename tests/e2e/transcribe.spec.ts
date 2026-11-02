import { existsSync } from 'node:fs';
import { expect, test } from './fixtures';
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
    // Wait for the end of the sentence, so stopping does not cut it short. Match "dog" rather
    // than "lazy dog": with synthetic speech (espeak-ng in CI) Whisper sometimes hears "razor".
    await expect(live).toContainText(/\bdog\b/i, { timeout: 150_000 });

    await stopAndOpenNote(page);
    const editor = page.getByRole('textbox', { name: 'Note text' });
    await expect(editor).toContainText(/quick brown fox/i, { timeout: 120_000 });
    await expect(editor).toContainText(/\bdog\b/i);
    // The editor shows the live draft first; the Timestamps tab appears once the final pass
    // has saved its timestamped segments, which can take a while on a CI machine.
    await expect(page.getByRole('tab', { name: 'Timestamps' })).toBeVisible({ timeout: 120_000 });
  });
});
