import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { ensureModelReady } from './helpers';

test.describe('transcription', () => {
  test.skip(!existsSync('tests/fixtures/speech.wav'), 'needs macOS say to generate speech.wav');

  test('shows live text while recording and a final transcript after stop', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();

    const live = page.getByRole('region', { name: 'Live transcript' });
    await expect(live).toContainText(/fox/i, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Stop recording' }).click();
    const transcript = page.getByRole('region', { name: 'Transcript', exact: true });
    await expect(transcript).toContainText(/quick brown fox/i, { timeout: 120_000 });
    await expect(transcript).toContainText(/lazy dog/i);
  });
});
