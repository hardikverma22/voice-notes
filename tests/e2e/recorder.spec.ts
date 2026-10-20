import { expect, test } from '@playwright/test';
import { ensureModelReady, sidebarNotes } from './helpers';

test.describe('recorder', () => {
  test('records, draws the waveform, and saves a note with audio', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByText('Recording', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(3000);

    const hasPixels = await page.getByRole('img', { name: 'Live audio level' }).evaluate((el) => {
      const canvas = el as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) return false;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if ((data[i] ?? 0) > 0) return true;
      }
      return false;
    });
    expect(hasPixels).toBe(true);

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByText('Saved to your notes').first()).toBeVisible();
    await expect(sidebarNotes(page)).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });

  test('pause stops the clock and resume continues it', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Pause recording' }).click();
    await expect(page.getByText('Paused', { exact: true }).first()).toBeVisible();
    const clock = page.getByLabel(/^Elapsed /);
    const before = await clock.getAttribute('aria-label');
    await page.waitForTimeout(1500);
    expect(await clock.getAttribute('aria-label')).toBe(before);
    await page.getByRole('button', { name: 'Resume recording' }).click();
    await expect(page.getByText('Recording', { exact: true }).first()).toBeVisible();
  });

  test('discard throws the recording away', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Discard recording' }).click();
    await expect(page.getByText('Recording discarded')).toBeVisible();
    await expect(sidebarNotes(page)).toHaveCount(0);
  });

  test('Space toggles recording exactly once with focus on the page body', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await page.waitForTimeout(1000);
    await page.keyboard.press('Space');
    await expect(page.getByText('Saved to your notes').first()).toBeVisible();
  });

  test('keeps recording while browsing notes, with a floating stop control', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.getByRole('button', { name: 'Text note' }).first().click();
    await expect(page).toHaveURL(/#\/note\//);
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Stop and save recording' }).click();
    await expect(page.getByText('Saved to your notes').first()).toBeVisible();
    await expect(sidebarNotes(page)).toHaveCount(2);
  });

  test('shows the permission message when the microphone is denied', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByRole('alert')).toContainText('Microphone access is blocked');
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
  });
});
