import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('collects checklist items from notes and ticks them in the note', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('voice-notes');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const item = (text: string, checked: boolean) => ({
      type: 'taskItem',
      attrs: { checked },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const now = Date.now();
    const tx = db.transaction('notes', 'readwrite');
    tx.objectStore('notes').put({
      id: 'tasks-note',
      title: 'Party prep',
      contentJson: JSON.stringify({
        type: 'doc',
        content: [
          { type: 'taskList', content: [item('Buy balloons', false), item('Send invites', true)] },
        ],
      }),
      plainText: 'Buy balloons\nSend invites',
      segments: [],
      audioId: null,
      durationMs: 0,
      language: 'english',
      modelId: 'seed',
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
    await new Promise<void>((resolve) => (tx.oncomplete = () => resolve()));
    db.close();
  });
  await page.goto('/#/tasks');
  await page.reload();

  await expect(page.getByRole('link', { name: 'Tasks', exact: false }).first()).toContainText('1');
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );

  const open = page.getByRole('checkbox', { name: 'Buy balloons' });
  await expect(open).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Send invites' })).toHaveCount(0);

  // The native checkbox is visually hidden behind the drawn box; people click the label.
  await page.getByRole('main').getByText('Buy balloons', { exact: true }).click();
  await expect(page.getByText('Done: Buy balloons')).toBeVisible();
  await expect(page.getByText('All done')).toBeVisible();

  await page.getByRole('radio', { name: /Done/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Buy balloons' })).toBeChecked();

  await page
    .getByRole('main')
    .getByRole('link', { name: /Party prep/ })
    .click();
  const editor = page.getByRole('textbox', { name: 'Note text' });
  await expect(editor.locator('li[data-checked="true"]')).toHaveCount(2);
});
