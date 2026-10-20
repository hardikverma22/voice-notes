import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ensureModelReady, SEEDED_NOTE_ID, seedNote } from './helpers';

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`home has no serious axe violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await ensureModelReady(page);
    expect(await seriousViolations(page)).toEqual([]);
  });

  test(`note page has no serious axe violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto('/');
    await ensureModelReady(page);
    await seedNote(page);
    await page.goto(`/#/note/${SEEDED_NOTE_ID}`);
    await expect(page.getByRole('textbox', { name: 'Note text' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
}

/** Computed animation duration of the record ring in milliseconds. */
async function ringDurationMs(page: Page): Promise<number> {
  const raw = await page
    .getByRole('button', { name: 'Stop recording' })
    .evaluate((el) => getComputedStyle(el, '::before').animationDuration);
  const value = parseFloat(raw);
  return raw.trim().endsWith('ms') ? value : value * 1000;
}

test('reduced motion stops the record ring animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  expect(await ringDurationMs(page)).toBeLessThanOrEqual(0.01);
  await page.getByRole('button', { name: 'Stop recording' }).click();
});

test('the ring animates normally without reduced motion (control for the test above)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await ensureModelReady(page);
  await page.getByRole('button', { name: 'Start recording' }).click();
  expect(await ringDurationMs(page)).toBeCloseTo(2400, -2);
  await page.getByRole('button', { name: 'Stop recording' }).click();
});

test('phone width has no horizontal scroll and a large record button', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await ensureModelReady(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(overflow).toBe(true);
  const box = await page.getByRole('button', { name: 'Start recording' }).boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(72);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(72);
});
