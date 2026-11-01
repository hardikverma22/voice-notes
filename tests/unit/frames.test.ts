// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoiceNotesDB } from '../../src/storage/db';
import {
  addSessionFrame,
  adoptSessionFrames,
  countSessionFrames,
  deleteFrame,
  discardSessionFrames,
  frameCountsByNote,
  listNoteFrames,
  restoreFrame,
  setFrameStrokes,
} from '../../src/storage/frames';
import { createNote, deleteAllNotes, deleteNote, restoreNote } from '../../src/storage/notes';

let database: VoiceNotesDB;

beforeEach(() => {
  database = new VoiceNotesDB('test-' + crypto.randomUUID());
});

afterEach(async () => {
  database.close();
  await database.delete();
});

const image = (t: number) => ({
  blob: new Blob(['img']),
  mimeType: 'image/webp',
  width: 1920,
  height: 1080,
  t,
  source: 'auto' as const,
});

const base = {
  title: 'Bug report',
  contentJson: '{}',
  plainText: '',
  segments: [],
  audioId: null,
  durationMs: 1000,
  language: 'english',
  modelId: 'test-model',
  device: 'wasm' as const,
};

describe('frames', () => {
  it('moves a session’s frames onto the note, shifted by the append offset', async () => {
    const note = await createNote(base, database);
    const sid = crypto.randomUUID();
    await addSessionFrame(sid, image(4), database);
    await addSessionFrame(sid, image(1), database);
    await addSessionFrame('other', image(2), database);

    expect(await adoptSessionFrames(sid, note.id, 30, database)).toBe(2);
    const frames = await listNoteFrames(note.id, database);
    expect(frames.map((f) => f.t)).toEqual([31, 34]);
    expect(frames.every((f) => f.sessionId === null)).toBe(true);
    expect(await countSessionFrames('other', database)).toBe(1);
  });

  it('discards a session’s frames', async () => {
    const sid = crypto.randomUUID();
    await addSessionFrame(sid, image(0), database);
    await discardSessionFrames(sid, database);
    expect(await countSessionFrames(sid, database)).toBe(0);
  });

  it('saves drawings, and deletes and restores single frames', async () => {
    const note = await createNote(base, database);
    const frame = await addSessionFrame('s', image(0), database);
    await adoptSessionFrames('s', note.id, 0, database);
    const stroke = {
      id: 'a',
      tool: 'box' as const,
      color: '#f00',
      points: [
        [0, 0],
        [1, 1],
      ] as [number, number][],
    };
    await setFrameStrokes(frame.id, [stroke], database);
    expect((await listNoteFrames(note.id, database))[0]!.strokes).toEqual([stroke]);

    const removed = await deleteFrame(frame.id, database);
    expect(await listNoteFrames(note.id, database)).toHaveLength(0);
    await restoreFrame(removed!, database);
    expect(await listNoteFrames(note.id, database)).toHaveLength(1);
  });

  it('go with their note on delete, come back on undo, and clear with everything', async () => {
    const note = await createNote(base, database);
    await addSessionFrame('s', image(0), database);
    await adoptSessionFrames('s', note.id, 0, database);

    const removed = await deleteNote(note.id, database);
    expect(removed?.frames).toHaveLength(1);
    expect(await database.frames.count()).toBe(0);
    await restoreNote(removed!, database);
    expect(await listNoteFrames(note.id, database)).toHaveLength(1);

    await deleteAllNotes(database);
    expect(await database.frames.count()).toBe(0);
  });

  it('counts frames per note from the index', async () => {
    const a = await createNote(base, database);
    const b = await createNote(base, database);
    await addSessionFrame('s1', image(0), database);
    await addSessionFrame('s1', image(1), database);
    await adoptSessionFrames('s1', a.id, 0, database);
    await addSessionFrame('s2', image(0), database);
    await adoptSessionFrames('s2', b.id, 0, database);
    await addSessionFrame('running', image(0), database);
    const counts = await frameCountsByNote(database);
    expect(Object.fromEntries(counts)).toEqual({ [a.id]: 2, [b.id]: 1 });
  });
});
