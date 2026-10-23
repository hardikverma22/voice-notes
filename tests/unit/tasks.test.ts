// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoiceNotesDB } from '../../src/storage/db';
import { createNote, getNote } from '../../src/storage/notes';
import {
  collectTasks,
  extractTasks,
  setTaskChecked,
  toggleTask,
} from '../../src/features/tasks/tasks';

const item = (text: string, checked = false, nested?: object) => ({
  type: 'taskItem',
  attrs: { checked },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...(nested ? [nested] : [])],
});
const doc = JSON.stringify({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
    {
      type: 'taskList',
      content: [
        item('Book the table'),
        item('Order cake', true, { type: 'taskList', content: [item('Lemon flavour')] }),
      ],
    },
  ],
});

describe('extractTasks', () => {
  it('finds task items in order, nested ones too, without sub-task text', () => {
    expect(extractTasks(doc)).toEqual([
      { index: 0, text: 'Book the table', checked: false },
      { index: 1, text: 'Order cake', checked: true },
      { index: 2, text: 'Lemon flavour', checked: false },
    ]);
    expect(extractTasks('not json')).toEqual([]);
  });

  it('changes only the chosen item', () => {
    const next = setTaskChecked(doc, 2, true)!;
    expect(extractTasks(next).map((t) => t.checked)).toEqual([false, true, true]);
    expect(setTaskChecked(doc, 9, true)).toBeNull();
  });
});

describe('toggleTask', () => {
  let database: VoiceNotesDB;
  beforeEach(() => {
    database = new VoiceNotesDB('test-' + crypto.randomUUID());
  });
  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('ticks a task in its note, and refuses if the note changed underneath', async () => {
    const note = await createNote(
      {
        title: 'Birthday',
        contentJson: doc,
        plainText: '',
        segments: [],
        audioId: null,
        durationMs: 0,
        language: 'english',
        modelId: 'm',
        device: 'wasm',
      },
      database,
    );
    const [first] = extractTasks(doc);
    expect(await toggleTask(note.id, first!, true, database)).toBe(true);
    const saved = await getNote(note.id, database);
    expect(extractTasks(saved!.contentJson)[0]?.checked).toBe(true);
    expect(await toggleTask(note.id, { ...first!, text: 'Something else' }, false, database)).toBe(
      false,
    );
    expect(collectTasks([saved!])[0]?.tasks).toHaveLength(3);
  });
});
