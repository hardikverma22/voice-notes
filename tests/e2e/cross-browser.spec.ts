import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// Runs in Chromium, Firefox and WebKit: the parts of screen recording every engine can show
// without faking a shared screen.

test('home offers voice or voice + screen, and the record button follows the choice', async ({
  page,
}) => {
  await page.goto('/');
  const mode = page.getByRole('radiogroup', { name: 'What to record' });
  await expect(mode).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();

  await mode.getByRole('radio', { name: 'Voice + screen' }).click();
  await expect(mode.getByRole('radio', { name: 'Voice + screen' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Start screen recording' })).toBeVisible();
  await expect(page.getByText('Tap, pick what to share, then talk it through')).toBeVisible();

  // The choice is remembered.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start screen recording' })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
  ).toEqual([]);
});

test('tooltips show on hover after a short delay', async ({ page }) => {
  await page.goto('/');
  const button = page.locator('[data-tip]').first();
  await expect(button).toBeVisible();
  const opacity = () => button.evaluate((el) => Number(getComputedStyle(el, '::after').opacity));
  expect(await opacity()).toBe(0);
  await button.hover();
  // 350 ms delay, then a 120 ms fade.
  await expect.poll(opacity, { timeout: 2000 }).toBe(1);
  const content = await button.evaluate((el) => getComputedStyle(el, '::after').content);
  expect(content).toContain(
    await button.getAttribute('data-tip').then((tip) => tip!.split('\n')[0]),
  );
});

// Regression: Firefox reported "A new version is ready" after a reload during the first
// service worker install, with no new version waiting.
test('a quick reload on the first visit does not claim an update', async ({ page }) => {
  await page.goto('/');
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.getByText('A new version is ready')).toHaveCount(0);
});
