import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => `${n.target} ${n.any[0]?.message ?? ''}`).join(', ')}`,
    ),
  ).toEqual([]);
}

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
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(page.getByText('Sharing screen')).toBeHidden();
    await page.getByRole('button', { name: 'Open note' }).click();

    const strip = page.getByTestId('frames');
    await expect(strip.getByRole('button')).not.toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Screen/ })).toBeVisible();
    // Each frame also shows as a tick on the audio timeline.
    const frameCount = await strip.getByRole('button').count();
    await expect(page.getByTestId('frame-ticks').locator('button')).toHaveCount(frameCount);
    await strip.getByRole('button').first().click();

    const viewer = page.getByRole('dialog', { name: /^Frame 1 of/ });
    await expect(viewer).toBeVisible();
    await expectNoAxeViolations(page);
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

    // Export for agent: a zip with the reports, the frames with marks flattened in, and audio.
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export for agent' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    const names = Object.keys(files);
    expect(names).toEqual(expect.arrayContaining(['report.md', 'report.html']));
    expect(names.some((name) => /^audio\./.test(name))).toBe(true);
    const frameFiles = names.filter((name) => name.startsWith('frames/'));
    expect(frameFiles.length).toBeGreaterThanOrEqual(2);
    const md = strFromU8(files['report.md']!);
    expect(md).toContain('## Walkthrough');
    expect(md).toContain('(marked up)');
    for (const file of frameFiles) expect(md).toContain(`](${file})`);
    const html = strFromU8(files['report.html']!);
    expect(html).toContain('<audio id="audio"');
    expect(html.match(/src="data:image\//g)?.length).toBe(frameFiles.length);

    expect(consoleErrors).toEqual([]);
  });
});
