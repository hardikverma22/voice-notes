import { expect, test, type Page } from '@playwright/test';
import { ensureModelReady, stopAndOpenNote } from './helpers';

// Utility spec that writes README screenshots. Run with: SCREENSHOTS=1 npx playwright test screenshots.spec.ts
test.describe.configure({ mode: 'serial' });
test.skip(process.env.SCREENSHOTS !== '1', 'set SCREENSHOTS=1 to write docs/screenshots');
test.use({ deviceScaleFactor: 2 });

const OUT = 'docs/screenshots';
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
const MIN = 60_000;
const DAY = 86_400_000;

function doc(...blocks: Record<string, unknown>[]) {
  return JSON.stringify({ type: 'doc', content: blocks });
}
const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const h2 = (text: string) => ({
  type: 'heading',
  attrs: { level: 2 },
  content: [{ type: 'text', text }],
});
const tasks = (...items: [string, boolean][]) => ({
  type: 'taskList',
  content: items.map(([text, checked]) => ({
    type: 'taskItem',
    attrs: { checked },
    content: [p(text)],
  })),
});

/** A believable library: a pinned note, a few from this week, older ones by month. */
async function seedLibrary(page: Page) {
  await page.evaluate(
    async ({ MIN, DAY }) => {
      const now = Date.now();
      const notes = [
        {
          title: 'Product launch checklist',
          text: 'Finalise pricing page copy, record the demo video, and line up three beta customers for quotes before Friday.',
          ago: 2 * DAY,
          pinned: true,
          durationMs: 94_000,
        },
        {
          title: 'Idea: weekly review ritual',
          text: 'Every Sunday, ten minutes: what moved, what stalled, one thing to drop. Talk it out instead of typing it.',
          ago: 3 * 60 * MIN,
          durationMs: 61_000,
        },
        {
          title: 'Call with Priya about onboarding',
          text: 'She suggested we cut the signup form to two fields and move the survey to after the first recording.',
          ago: 26 * 60 * MIN,
          durationMs: 212_000,
        },
        {
          title: 'Groceries',
          text: 'Oat milk, eggs, spinach, coffee beans, lemons. Also pick up the dry cleaning on the way back.',
          ago: 3 * DAY,
          durationMs: 18_000,
        },
        {
          title: 'Book notes: Deep Work',
          text: 'Schedule focus blocks like meetings. Shallow work expands to fill the time you give it.',
          ago: 5 * DAY,
          durationMs: 0,
        },
        {
          title: 'Trip planning — Lisbon',
          text: 'Alfama in the morning before the crowds, tram 28 is overrated, book the fado dinner a week ahead.',
          ago: 34 * DAY,
          durationMs: 143_000,
        },
      ];
      const open = indexedDB.open('voice-notes');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        notes.forEach((note, index) => {
          const at = now - note.ago;
          tx.objectStore('notes').put({
            id: `seed-${index}`,
            title: note.title,
            contentJson: JSON.stringify({
              type: 'doc',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: note.text }] }],
            }),
            plainText: note.text,
            segments: [],
            // Seeded notes have no stored audio; the list shows their duration only.
            audioId: note.durationMs > 0 ? `seed-audio-${index}` : null,
            durationMs: note.durationMs,
            language: 'english',
            modelId: 'seed',
            device: 'wasm',
            createdAt: at,
            updatedAt: at,
            pinned: note.pinned ?? false,
            status: 'ready',
            autoTitle: false,
          });
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { MIN, DAY },
  );
}

/** Gives the recorded note a title and some structure, keeping its audio and timestamps. */
async function dressRecordedNote(page: Page, id: string) {
  const contentJson = doc(
    p('The quick brown fox jumps over the lazy dog.'),
    h2('Next steps'),
    tasks(
      ['Turn this into the opening line of the demo', true],
      ['Share the recording with the team', false],
      ['Try it again with background noise', false],
    ),
  );
  await page.evaluate(
    async ({ id, contentJson }) => {
      const open = indexedDB.open('voice-notes');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('notes', 'readwrite');
        const store = tx.objectStore('notes');
        const get = store.get(id);
        get.onsuccess = () => {
          store.put({
            ...get.result,
            title: 'Demo script, first take',
            contentJson,
            plainText:
              'The quick brown fox jumps over the lazy dog. Next steps: open the demo with this line, share the recording with the team, try again with background noise.',
            autoTitle: false,
          });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { id, contentJson },
  );
}

/** Hides the one-off "Ready to work offline" banner so it does not cover the shots. */
async function dismissBanners(page: Page) {
  const ok = page.getByRole('button', { name: 'OK', exact: true });
  if (await ok.isVisible().catch(() => false)) await ok.click();
}

async function settle(page: Page) {
  // Let entrance animations and fonts finish so shots are stable.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

test('README screenshots', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize(DESKTOP);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await ensureModelReady(page);
  await seedLibrary(page);
  await page.reload();
  await ensureModelReady(page);
  await dismissBanners(page);

  // 1. Recording in progress, with live text.
  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('region', { name: 'Live transcript' })).toContainText(/fox/i, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/recording-light.png` });

  // 2. Stop, wait for the final transcript, and dress the note up.
  await stopAndOpenNote(page);
  const noteId = decodeURIComponent(page.url().split('#/note/')[1] ?? '');
  await expect(page.getByRole('textbox', { name: 'Note text' })).toHaveAttribute(
    'contenteditable',
    'true',
    { timeout: 120_000 },
  );
  await dressRecordedNote(page, noteId);

  // 3. Home with the library, light and dark. A late-morning clock keeps the greeting friendly.
  const morning = new Date();
  morning.setHours(10, 30, 0, 0);
  if (morning.getTime() < Date.now()) morning.setTime(Date.now());
  await page.clock.setFixedTime(morning);
  await page.goto('/#/');
  await page.reload();
  await ensureModelReady(page);
  await dismissBanners(page);
  await settle(page);
  await page.screenshot({ path: `${OUT}/home-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await settle(page);
  await page.screenshot({ path: `${OUT}/home-dark.png` });

  // 4. Note page with player, timestamps tab and editor, light and dark.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto(`/#/note/${noteId}`);
  await expect(page.getByRole('button', { name: 'Play recording' })).toBeVisible();
  // Park the playhead at about 40% so the played part of the waveform shows.
  const slider = page.getByRole('slider', { name: 'Playback position' });
  const box = await slider.boundingBox();
  if (box) await page.mouse.click(box.x + box.width * 0.4, box.y + box.height / 2);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.mouse.move(0, 0);
  await settle(page);
  await page.screenshot({ path: `${OUT}/note-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await settle(page);
  await page.screenshot({ path: `${OUT}/note-dark.png` });

  // 5. Search with highlighted matches.
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/#/');
  await page.keyboard.press('ControlOrMeta+k');
  await page.keyboard.type('onboarding');
  await settle(page);
  await page.screenshot({ path: `${OUT}/search-light.png` });

  // 6. Settings.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await settle(page);
  await page.screenshot({ path: `${OUT}/settings-light.png` });
  await page.getByRole('button', { name: 'Close' }).click();

  // 7. Phone: home (light) and note (dark).
  await page.setViewportSize(PHONE);
  await page.goto('/#/');
  await settle(page);
  await page.screenshot({ path: `${OUT}/phone-home-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(`/#/note/${noteId}`);
  await expect(page.getByRole('button', { name: 'Play recording' })).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${OUT}/phone-note-dark.png` });
});
