import { readFile } from 'node:fs/promises';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from './fixtures';

// A 20-minute screen recording can keep hundreds of frames. This seeds 300 full-HD frames and
// checks that the note page, the video export and the agent export stay usable at that size.
const FRAMES = 300;

test('a long screen recording stays fast to open and to export', async ({ page, context }) => {
  test.setTimeout(240_000);
  const source = await context.newPage();
  await source.setViewportSize({ width: 1920, height: 1080 });
  await source.setContent(
    `<body style="margin:0;font:40px system-ui;background:linear-gradient(45deg,#eee,#9ab)">
      <h1 style="padding:60px">A long recording</h1>
      <p style="padding:0 60px">${'lorem ipsum dolor sit amet '.repeat(80)}</p></body>`,
  );
  const jpeg = await source.screenshot({ type: 'jpeg', quality: 85 });
  await source.close();

  await page.goto('/');
  await page.evaluate(
    async ({ b64, count }) => {
      const open = indexedDB.open('voice-notes');
      const db = await new Promise<IDBDatabase>(
        (resolve) => (open.onsuccess = () => resolve(open.result)),
      );
      const tx = db.transaction(['notes', 'frames'], 'readwrite');
      const now = Date.now();
      tx.objectStore('notes').put({
        id: 'long',
        title: 'Long recording',
        contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
        plainText: '',
        segments: [],
        audioId: null,
        durationMs: count * 4000,
        language: 'english',
        modelId: 'm',
        device: 'wasm',
        createdAt: now,
        updatedAt: now,
        pinned: false,
        status: 'ready',
        autoTitle: false,
        tags: [],
        bookmarks: [],
        pendingAppend: null,
      });
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      for (let i = 0; i < count; i++) {
        tx.objectStore('frames').put({
          id: `f${i}`,
          noteId: 'long',
          sessionId: null,
          t: i * 4,
          blob: new Blob([bytes], { type: 'image/jpeg' }),
          mimeType: 'image/jpeg',
          width: 1920,
          height: 1080,
          source: 'auto',
          strokes: [],
          createdAt: now,
          text: '',
        });
      }
      await new Promise((resolve) => (tx.oncomplete = resolve));
    },
    { b64: jpeg.toString('base64'), count: FRAMES },
  );

  const opened = Date.now();
  await page.goto('/#/note/long');
  await page.reload();
  const strip = page.getByTestId('frames');
  await expect(strip.getByRole('button')).toHaveCount(FRAMES, { timeout: 30_000 });
  expect(Date.now() - opened).toBeLessThan(10_000);
  // Thumbnails load lazily: only those near the viewport are decoded.
  const decoded = await strip
    .locator('img')
    .evaluateAll(
      (images) => images.filter((img) => (img as HTMLImageElement).naturalWidth > 0).length,
    );
  expect(decoded).toBeLessThan(60);

  // Video: renders one frame at a time.
  const video = page.waitForEvent('download', { timeout: 150_000 });
  await page.getByRole('button', { name: 'Video' }).click();
  expect((await video).suggestedFilename()).toMatch(/\.mp4$/);

  // Agent zip: frames are not duplicated into report.html at this size; it links to them.
  const bundle = page.waitForEvent('download', { timeout: 150_000 });
  await page.getByRole('button', { name: 'Export for agent' }).click();
  const zip = await readFile((await (await bundle).path())!);
  expect(zip.length).toBeLessThan(FRAMES * jpeg.length * 1.15);
  const html = strFromU8(
    unzipSync(new Uint8Array(zip), { filter: (f) => f.name === 'report.html' })['report.html']!,
  );
  expect(html).not.toContain('data:image/');
  expect(html).toContain('src="frames/001-');
});
