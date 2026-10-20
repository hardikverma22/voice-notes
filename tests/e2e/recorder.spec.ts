import { expect, test } from '@playwright/test';
import { ensureModelReady } from './helpers';

test.describe('recorder', () => {
  test('records, draws the waveform, and plays the clip back', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.waitForTimeout(3000);

    const hasPixels = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return false;
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) {
        if ((data[i] ?? 0) > 0) return true;
      }
      return false;
    });
    expect(hasPixels).toBe(true);

    await page.getByRole('button', { name: 'Stop recording' }).click();
    const audio = page.getByRole('region', { name: 'Last recording' }).or(page.locator('audio'));
    await expect(audio.first()).toBeVisible();
    const duration = await page
      .locator('audio')
      .first()
      .evaluate(async (el: HTMLAudioElement) => {
        if (el.readyState < 1) {
          await new Promise((resolve) =>
            el.addEventListener('loadedmetadata', resolve, { once: true }),
          );
        }
        if (el.duration === Infinity) {
          el.currentTime = 1e9;
          await new Promise((resolve) =>
            el.addEventListener('timeupdate', resolve, { once: true }),
          );
          el.currentTime = 0;
        }
        return el.duration;
      });
    expect(duration === Infinity || duration > 2).toBe(true);

    expect(consoleErrors).toEqual([]);
  });

  test('Space toggles recording exactly once with focus on the page body', async ({ page }) => {
    await page.goto('/');
    await ensureModelReady(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(/#\/note\//);
  });

  test('shows the permission message when the microphone is denied', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException('Denied', 'NotAllowedError'));
    });
    await page.goto('/');
    await ensureModelReady(page);
    await page.getByRole('button', { name: 'Start recording' }).click();
    await expect(page.getByRole('alert')).toContainText('Microphone access is blocked');
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
  });
});
