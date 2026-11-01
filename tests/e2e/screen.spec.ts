import { expect, test } from '@playwright/test';

test.describe('screen recording', () => {
  test('records with a shared screen, then marks up a frame on the note', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Record with screen' }).click();
    await expect(page.getByText('Sharing screen')).toBeVisible();
    await expect(page.getByText('Recording', { exact: true }).first()).toBeVisible();

    // The first frame is kept automatically once the screen holds still; S takes another.
    await expect(page.getByText(/· [1-9]\d* frames?/)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('s');
    await expect(page.getByText(/· ([2-9]|\d{2,}) frames/)).toBeVisible();

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByText('Sharing screen')).toBeHidden();
    await page.getByRole('button', { name: 'Open note' }).click();

    const strip = page.getByTestId('frames');
    await expect(strip.getByRole('button')).not.toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Screen/ })).toBeVisible();
    await strip.getByRole('button').first().click();

    const viewer = page.getByRole('dialog', { name: /^Frame 1 of/ });
    await expect(viewer).toBeVisible();
    const surface = viewer.getByTestId('draw-surface');
    const box = (await surface.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();
    await expect(surface.locator('path')).toHaveCount(1);

    // Undo and redraw with the box tool.
    await page.keyboard.press('ControlOrMeta+z');
    await expect(surface.locator('path')).toHaveCount(0);
    await page.keyboard.press('4');
    await expect(viewer.getByRole('button', { name: 'Box (4)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 4 });
    await page.mouse.up();
    await expect(surface.locator('path')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    // The drawing is saved: the thumbnail shows it now, and still after a reload.
    const markedUp = page.getByRole('button', { name: /^Frame \d+ at .*, marked up$/ });
    await expect(markedUp).toHaveCount(1);
    await page.reload();
    await expect(markedUp).toHaveCount(1);
    expect(consoleErrors).toEqual([]);
  });
});
