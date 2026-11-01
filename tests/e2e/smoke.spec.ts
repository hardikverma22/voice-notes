import { expect, test } from './fixtures';

test('app shell renders and the browser supports Opus WebM recording', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText("What's on your mind?");
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();

  const supportsOpus = await page.evaluate(() =>
    MediaRecorder.isTypeSupported('audio/webm;codecs=opus'),
  );
  expect(supportsOpus).toBe(true);
});

// vite.config.ts strips unused Phosphor weights; a weight it drops would render an empty svg.
test('icons render after unused icon weights are stripped', async ({ page }) => {
  await page.goto('/');
  const counts = await page.evaluate(() => {
    const icons = [...document.querySelectorAll('svg[viewBox="0 0 256 256"]')];
    return { total: icons.length, empty: icons.filter((svg) => !svg.querySelector('*')).length };
  });
  expect(counts.total).toBeGreaterThan(5);
  expect(counts.empty).toBe(0);
});
