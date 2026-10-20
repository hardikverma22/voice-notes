import { expect, test } from '@playwright/test';
import { ensureModelReady, seedNote, SEEDED_NOTE_ID } from './helpers';

// Utility spec that writes README screenshots. Run with: SCREENSHOTS=1 npx playwright test screenshots.spec.ts
test.describe.configure({ mode: 'serial' });
test.skip(process.env.SCREENSHOTS !== '1', 'set SCREENSHOTS=1 to write docs/screenshots');

const OUT = 'docs/screenshots';

test('home and note screens in light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 780 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await ensureModelReady(page);
  await page.screenshot({ path: `${OUT}/home-light.png`, fullPage: true });

  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await ensureModelReady(page);
  await page.screenshot({ path: `${OUT}/home-dark.png`, fullPage: true });

  await seedNote(page);
  await page.goto(`/#/note/${SEEDED_NOTE_ID}`);
  await expect(page.getByRole('textbox', { name: 'Note text' })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.screenshot({ path: `${OUT}/note-light.png`, fullPage: true });
});

test('phone dark', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await ensureModelReady(page);
  await page.screenshot({ path: `${OUT}/phone-dark.png` });
});
