import { expect, test } from '@playwright/test';
import { ensureModelReady, modelChip, sidebarNotes, stopAndOpenNote } from './helpers';

test('works offline after the first run and reports installability', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ensureModelReady(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
  await expect(modelChip(page)).toHaveAttribute('aria-label', /On-device/, { timeout: 60_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();

  await page.getByRole('button', { name: 'Start recording' }).click();
  await page.waitForTimeout(4000);
  await stopAndOpenNote(page);
  await expect(page.getByRole('textbox', { name: 'Note text' })).toContainText(/fox/i, {
    timeout: 120_000,
  });
  await expect(sidebarNotes(page)).toHaveCount(1);
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
