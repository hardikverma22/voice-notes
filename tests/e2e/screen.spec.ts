import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';

/**
 * axe on the page as it settles: entrance fades briefly blend text toward the background, so
 * this polls until clean. A real violation persists and fails with its details.
 */
async function expectNoAxeViolations(page: Page) {
  await expect
    .poll(
      async () => {
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        return results.violations.map(
          (v) =>
            `${v.id}: ${v.nodes.map((n) => `${n.target} ${n.any[0]?.message ?? ''}`).join(', ')}`,
        );
      },
      { timeout: 6000, intervals: [400, 800, 1500] },
    )
    .toEqual([]);
}

test.describe('screen recording', () => {
  test('records with a shared screen, then marks up a frame on the note', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');
    await page.getByRole('radio', { name: 'Voice + screen' }).click();
    await page.getByRole('button', { name: 'Start screen recording' }).click();
    const shared = page.getByRole('region', { name: 'Shared screen' });
    await expect(shared).toBeVisible();
    await expect(shared.getByLabel('Live preview of the shared screen')).toBeVisible();
    await expect(page.getByText('Recording', { exact: true }).first()).toBeVisible();

    // The first frame is kept automatically once the screen holds still; S takes another.
    await expect(page.getByText(/^[1-9]\d* frames? kept$/)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('s');
    await expect(page.getByText(/^([2-9]|\d{2,}) frames kept$/)).toBeVisible();
    await expectNoAxeViolations(page);

    // D freezes a frame to draw on while the recording keeps going; Enter goes back.
    await page.keyboard.press('d');
    const live = page.getByRole('dialog', { name: 'Draw on the screen' });
    await expect(live).toBeVisible();
    await expect(live).toContainText('Still recording');
    await expectNoAxeViolations(page);
    const liveSurface = live.getByTestId('draw-surface');
    const liveBox = (await liveSurface.boundingBox())!;
    await page.mouse.move(liveBox.x + liveBox.width * 0.4, liveBox.y + liveBox.height * 0.6);
    await page.mouse.down();
    await page.mouse.move(liveBox.x + liveBox.width * 0.6, liveBox.y + liveBox.height * 0.3, {
      steps: 5,
    });
    await page.mouse.up();
    await expect(liveSurface.locator('path')).toHaveCount(1);
    const clock = page.getByLabel(/^Elapsed /);
    const before = await clock.getAttribute('aria-label');
    await page.keyboard.press('Enter');
    await expect(live).toBeHidden();
    await expect(clock).not.toHaveAttribute('aria-label', before!); // still recording

    await page.getByRole('button', { name: 'Stop recording' }).click();
    await expect(shared).toBeHidden();
    await page.getByRole('button', { name: 'Open note' }).click();

    const strip = page.getByTestId('frames');
    await expect(strip.getByRole('button')).not.toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Screen/ })).toBeVisible();
    // Each frame also shows as a tick on the audio timeline.
    const frameCount = await strip.getByRole('button').count();
    await expect(page.getByTestId('frame-ticks').locator('button')).toHaveCount(frameCount);
    // The stage shows a frame; Mark up opens the full-screen viewer on it.
    await strip.getByRole('button').first().click();
    await expect(page.getByTestId('frame-stage')).toContainText(/^.*1\/\d+/);
    await page.getByRole('button', { name: /^Mark up/ }).click();

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
    // Two frames are marked up: the one drawn on during the recording, and this one.
    const markedUp = page.getByRole('button', { name: /^Frame \d+ at .*, marked up$/ });
    await expect(markedUp).toHaveCount(2);
    await page.reload();
    await expect(markedUp).toHaveCount(2);

    // Replay: playing from frame 1 moves the viewer to the next frame on its own.
    await page.getByTestId('frames').getByRole('button').first().click();
    await page.getByRole('button', { name: /^Mark up/ }).click();
    const replay = page.getByRole('dialog', { name: /^Frame 1 of/ });
    await expect(replay).toBeVisible();
    await replay.getByRole('button', { name: 'Play from this frame' }).click();
    await expect(page.getByRole('dialog', { name: /^Frame 2 of/ })).toBeVisible({ timeout: 8000 });
    await page.getByRole('dialog').getByRole('button', { name: 'Pause' }).click();
    await page.keyboard.press('Escape');

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

    // Export video: an MP4 the browser can play back, at 1080p, as long as the recording.
    const rendering = page.waitForEvent('download', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Video' }).click();
    const videoFile = await rendering;
    expect(videoFile.suggestedFilename()).toMatch(/\.mp4$/);
    const mp4 = await readFile((await videoFile.path())!);
    expect(mp4.subarray(4, 8).toString('latin1')).toBe('ftyp');
    const meta = await page.evaluate(async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const video = document.createElement('video');
      video.muted = true;
      video.src = URL.createObjectURL(new Blob([bytes], { type: 'video/mp4' }));
      await new Promise((resolve, reject) => {
        video.onloadeddata = resolve;
        video.onerror = () => reject(new Error(video.error?.message ?? 'video error'));
      });
      return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    }, mp4.toString('base64'));
    expect(meta).toMatchObject({ width: 1920, height: 1080 });
    expect(meta.duration).toBeGreaterThan(2);
    expect(meta.duration).toBeLessThan(30);

    expect(consoleErrors).toEqual([]);
  });
});
