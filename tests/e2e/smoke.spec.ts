import { expect, test } from '@playwright/test';

test('app shell renders and the browser supports Opus WebM recording', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Voice Notes' })).toBeVisible();

  const supportsOpus = await page.evaluate(() =>
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus'),
  );
  expect(supportsOpus).toBe(true);
});
