// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoiceNotesDB } from '../../src/storage/db';
import {
  appendChunk,
  discardSession,
  finalizeSession,
  listOrphanSessions,
} from '../../src/storage/audio';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  applyTranscript,
  exportBackup,
  importBackup,
  listUnfinishedNotes,
  restoreNote,
  setPinned,
  updateNoteContent,
} from '../../src/storage/notes';

let database: VoiceNotesDB;

beforeEach(() => {
  database = new VoiceNotesDB('test-' + crypto.randomUUID());
});

afterEach(async () => {
  database.close();
  await database.delete();
});

const base = {
  title: 'Hello',
  contentJson: '{}',
  plainText: 'Hello world',
  segments: [],
  audioId: null,
  durationMs: 1000,
  language: 'english',
  modelId: 'test-model',
  device: 'wasm' as const,
};

describe('notes', () => {
  it('creates, reads, and lists newest first', async () => {
    const first = await createNote(base, database);
    await new Promise((r) => setTimeout(r, 5));
    const second = await createNote({ ...base, title: 'Second' }, database);

    expect((await getNote(first.id, database))?.title).toBe('Hello');
    const list = await listNotes(database);
    expect(list.map((n) => n.id)).toEqual([second.id, first.id]);
  });

  it('updates content and bumps updatedAt', async () => {
    const note = await createNote(base, database);
    await new Promise((r) => setTimeout(r, 5));
    await updateNoteContent(
      note.id,
      { contentJson: '{"x":1}', plainText: 'Changed', title: 'Changed' },
      database,
    );
    const updated = await getNote(note.id, database);
    expect(updated?.plainText).toBe('Changed');
    expect(updated!.updatedAt).toBeGreaterThan(note.updatedAt);
  });

  it('deletes a note with its audio and returns both for undo', async () => {
    const note = await createNote(base, database);
    const sid = crypto.randomUUID();
    await appendChunk(sid, 0, new Blob(['abc']), 'audio/webm', database);
    const audio = await finalizeSession(sid, note.id, database);

    const removed = await deleteNote(note.id, database);
    expect(removed?.note.id).toBe(note.id);
    expect(removed?.audio.map((a) => a.id)).toEqual([audio.id]);
    expect(await getNote(note.id, database)).toBeUndefined();
    expect(await database.audio.get(audio.id)).toBeUndefined();
  });

  it('restores a deleted note and its audio', async () => {
    const note = await createNote(base, database);
    const sid = crypto.randomUUID();
    await appendChunk(sid, 0, new Blob(['abc']), 'audio/webm', database);
    await finalizeSession(sid, note.id, database);

    const removed = await deleteNote(note.id, database);
    await restoreNote(removed!, database);
    expect(await getNote(note.id, database)).toBeDefined();
    expect(await database.audio.where('noteId').equals(note.id).count()).toBe(1);
  });
});

describe('note lifecycle', () => {
  it('defaults new notes to ready, unpinned', async () => {
    const note = await createNote(base, database);
    expect(note.status).toBe('ready');
    expect(note.pinned).toBe(false);
  });

  it('pinning leaves updatedAt alone', async () => {
    const note = await createNote(base, database);
    await setPinned(note.id, true, database);
    const pinned = await getNote(note.id, database);
    expect(pinned?.pinned).toBe(true);
    expect(pinned?.updatedAt).toBe(note.updatedAt);
  });

  it('lists queued notes and replaces a generated title with the transcript', async () => {
    const note = await createNote({ ...base, status: 'queued', autoTitle: true }, database);
    expect((await listUnfinishedNotes(database)).map((n) => n.id)).toEqual([note.id]);
    await applyTranscript(
      note.id,
      {
        contentJson: '{}',
        plainText: 'Final words',
        segments: [],
        title: 'Final words',
        language: 'english',
        modelId: 'm',
        device: 'wasm',
      },
      database,
    );
    const done = await getNote(note.id, database);
    expect(done?.status).toBe('ready');
    expect(done?.title).toBe('Final words');
    expect(await listUnfinishedNotes(database)).toEqual([]);
  });

  it('keeps a title the person typed', async () => {
    const note = await createNote({ ...base, status: 'queued', autoTitle: true }, database);
    await updateNoteContent(
      note.id,
      { contentJson: '{}', plainText: '', title: 'My title' },
      database,
    );
    await applyTranscript(
      note.id,
      {
        contentJson: '{}',
        plainText: 'x',
        segments: [],
        title: 'Generated',
        language: 'english',
        modelId: 'm',
        device: 'wasm',
      },
      database,
    );
    expect((await getNote(note.id, database))?.title).toBe('My title');
  });

  it('round-trips a text backup and skips existing ids', async () => {
    const note = await createNote(base, database);
    const json = await exportBackup(database);
    expect(await importBackup(json, database)).toBe(0);
    await database.notes.delete(note.id);
    expect(await importBackup(json, database)).toBe(1);
    expect((await getNote(note.id, database))?.title).toBe('Hello');
    await expect(importBackup('{"format":"other"}', database)).rejects.toThrow();
  });
});

describe('audio sessions', () => {
  it('finalizes chunks into one Blob with the summed size and the stored mime type', async () => {
    const note = await createNote(base, database);
    const sid = crypto.randomUUID();
    await appendChunk(sid, 0, new Blob(['aaaa']), 'audio/webm;codecs=opus', database);
    await appendChunk(sid, 1, new Blob(['bb']), 'audio/webm;codecs=opus', database);
    await appendChunk(sid, 2, new Blob(['cccccc']), 'audio/webm;codecs=opus', database);

    const record = await finalizeSession(sid, note.id, database);
    expect(record.blob.size).toBe(12);
    expect(record.blob.type).toBe('audio/webm;codecs=opus');
    expect(await database.audioChunks.where('sessionId').equals(sid).count()).toBe(0);
  });

  it('lists orphan sessions and discards one', async () => {
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    await appendChunk(a, 0, new Blob(['x']), 'audio/webm', database);
    await appendChunk(b, 0, new Blob(['y']), 'audio/webm', database);
    expect((await listOrphanSessions(database)).sort()).toEqual([a, b].sort());

    await discardSession(a, database);
    expect(await listOrphanSessions(database)).toEqual([b]);
  });
});
