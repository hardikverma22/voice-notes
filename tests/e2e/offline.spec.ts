import { expect, test } from '@playwright/test';
import { ensureModelReady } from './helpers';

test('works offline after the first run and reports installability', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ensureModelReady(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Voice Notes', level: 1 })).toBeVisible();
  await expect(page.getByText(/^Ready\. Running on/)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();

  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page).toHaveURL(/#\/note\//, { timeout: 120_000 });
  await expect(page.getByRole('region', { name: 'Transcript', exact: true })).toContainText(/fox/i);

  await page.goto('/');
  await expect(page.getByRole('list', { name: 'Notes' }).getByRole('link')).toHaveCount(1);
  await context.setOffline(false);
});

test('manifest is installable', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.ok()).toBe(true);
  const manifest = (await response.json()) as {
    name: string;
    start_url: string;
    display: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest.name).toBe('Voice Notes');
  expect(manifest.start_url).toBe('/');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon) => icon.sizes === '192x192')).toBe(true);
  expect(manifest.icons.some((icon) => icon.sizes === '512x512')).toBe(true);
  expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
});
