// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VoiceNotesDB } from '../../src/storage/db';
import { appendChunk, finalizeSession, replaceNoteAudio } from '../../src/storage/audio';
import { exportZipBackup, importAnyBackup } from '../../src/storage/backup';
import {
  addBookmark,
  applyAppendedTranscript,
  createNote,
  exportBackup,
  getNote,
  removeBookmark,
  restoreBookmark,
  setTags,
  startAppend,
  updateBookmark,
} from '../../src/storage/notes';
import { addTag, collectTags, normalizeTag } from '../../src/lib/tags';
import { concatPcm, encodeWav } from '../../src/features/recorder/wav';
import { filterNotes } from '../../src/features/notes/groupNotes';

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
  contentJson: JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited by me.' }] }],
  }),
  plainText: 'Edited by me.',
  segments: [{ text: 'Hello', start: 0, end: 2 }],
  audioId: null,
  durationMs: 2000,
  language: 'english',
  modelId: 'test-model',
  device: 'wasm' as const,
};

describe('tags', () => {
  it('normalizes and dedupes without case', () => {
    expect(normalizeTag('  #Work   ideas ')).toBe('Work ideas');
    expect(normalizeTag('###')).toBe('');
    expect(addTag(['Work'], 'work')).toEqual(['Work']);
    expect(addTag(['Work'], 'home')).toEqual(['Work', 'home']);
  });

  it('counts tags across notes, most used first', () => {
    expect(collectTags([{ tags: ['b', 'a'] }, { tags: ['A'] }, {}])).toEqual([
      { tag: 'a', count: 2 },
      { tag: 'b', count: 1 },
    ]);
  });

  it('stores clean tags, finds notes by them, and leaves updatedAt alone', async () => {
    const note = await createNote(base, database);
    await setTags(note.id, ['Work', ' work ', '#Meeting', ''], database);
    const saved = await getNote(note.id, database);
    expect(saved?.tags).toEqual(['Work', 'Meeting']);
    expect(saved?.updatedAt).toBe(note.updatedAt);
    expect(await database.notes.where('tags').equals('Meeting').count()).toBe(1);
    expect(filterNotes([saved!], '#meeting')).toHaveLength(1);
  });
});

describe('bookmarks', () => {
  it('adds in time order, renames, removes and restores', async () => {
    const note = await createNote(base, database);
    const late = await addBookmark(note.id, 30, '', database);
    const early = await addBookmark(note.id, 5, 'Intro', database);
    let saved = await getNote(note.id, database);
    expect(saved?.bookmarks.map((b) => b.t)).toEqual([5, 30]);

    await updateBookmark(note.id, late!.id, 'Decision', database);
    const removed = await removeBookmark(note.id, early!.id, database);
    saved = await getNote(note.id, database);
    expect(saved?.bookmarks.map((b) => b.label)).toEqual(['Decision']);

    await restoreBookmark(note.id, removed!, database);
    saved = await getNote(note.id, database);
    expect(saved?.bookmarks.map((b) => b.label)).toEqual(['Intro', 'Decision']);
    expect(filterNotes([saved!], 'decision')).toHaveLength(1);
  });
});

describe('append a recording', () => {
  it('keeps edits, appends text and shifted segments, and clears the pending state', async () => {
    const note = await createNote({ ...base, autoTitle: true }, database);
    await startAppend(
      note.id,
      {
        audioId: 'a2',
        durationMs: 7000,
        offsetSec: 2,
        bookmarks: [{ id: 'b', t: 3, label: '', createdAt: 1 }],
      },
      database,
    );
    let saved = await getNote(note.id, database);
    expect(saved?.status).toBe('queued');
    expect(saved?.pendingAppend).toEqual({ offsetSec: 2 });

    await applyAppendedTranscript(
      note.id,
      {
        doc: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'More words.' }] }],
        },
        plainText: 'More words.',
        segments: [{ text: 'More words.', start: 2, end: 7 }],
        title: 'Should not replace',
      },
      database,
    );
    saved = await getNote(note.id, database);
    expect(saved?.status).toBe('ready');
    expect(saved?.pendingAppend).toBeNull();
    expect(saved?.title).toBe('Hello');
    expect(saved?.plainText).toBe('Edited by me.\n\nMore words.');
    expect(saved?.segments.map((s) => s.start)).toEqual([0, 2]);
    expect(saved?.bookmarks).toHaveLength(1);
    const doc = JSON.parse(saved!.contentJson) as { content: unknown[] };
    expect(doc.content).toHaveLength(2);
  });

  it('replaces every audio record of a note with one', async () => {
    const note = await createNote(base, database);
    const sid = crypto.randomUUID();
    await appendChunk(sid, 0, new Blob(['abc']), 'audio/webm', database);
    await finalizeSession(sid, note.id, database);
    const record = await replaceNoteAudio(
      note.id,
      new Blob(['wav'], { type: 'audio/wav' }),
      database,
    );
    const all = await database.audio.where('noteId').equals(note.id).toArray();
    expect(all.map((a) => a.id)).toEqual([record.id]);
    expect(record.mimeType).toBe('audio/wav');
  });

  it('encodes WAV with the right header and length', async () => {
    const pcm = concatPcm([new Float32Array([0, 0.5]), new Float32Array([-1])]);
    expect(Array.from(pcm)).toEqual([0, 0.5, -1]);
    const wav = encodeWav(pcm, 16_000);
    const view = new DataView(await wav.arrayBuffer());
    expect(wav.size).toBe(44 + 6);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});

describe('zip backup', () => {
  it('round-trips notes with tags, bookmarks and audio, and skips existing notes', async () => {
    const note = await createNote(base, database);
    const sid = crypto.randomUUID();
    await appendChunk(sid, 0, new Blob(['audio-bytes']), 'audio/webm', database);
    const audio = await finalizeSession(sid, note.id, database);
    await database.notes.update(note.id, { audioId: audio.id });
    await setTags(note.id, ['Work'], database);
    await addBookmark(note.id, 1, 'Key point', database);

    const { blob, notes, recordings } = await exportZipBackup(database);
    expect([notes, recordings]).toEqual([1, 1]);
    const file = new File([blob], 'backup.zip');

    expect(await importAnyBackup(file, database)).toEqual({ notes: 0, recordings: 0 });

    const other = new VoiceNotesDB('test-' + crypto.randomUUID());
    try {
      expect(await importAnyBackup(file, other)).toEqual({ notes: 1, recordings: 1 });
      const restored = await getNote(note.id, other);
      expect(restored?.tags).toEqual(['Work']);
      expect(restored?.bookmarks[0]?.label).toBe('Key point');
      const restoredAudio = await other.audio.get(restored!.audioId!);
      expect(await restoredAudio?.blob.text()).toBe('audio-bytes');
    } finally {
      other.close();
      await other.delete();
    }
  });

  it('still imports the older text-only JSON backup', async () => {
    const note = await createNote(base, database);
    await setTags(note.id, ['Kept'], database);
    const json = await exportBackup(database);
    await database.notes.delete(note.id);
    const result = await importAnyBackup(new File([json], 'b.json'), database);
    expect(result).toEqual({ notes: 1, recordings: 0 });
    expect((await getNote(note.id, database))?.tags).toEqual(['Kept']);
  });

  it('rejects a zip that is not a backup', async () => {
    const { zipSync, strToU8 } = await import('fflate');
    const zipped = zipSync({ 'other.txt': strToU8('hi') });
    await expect(
      importAnyBackup(new File([zipped as Uint8Array<ArrayBuffer>], 'x.zip'), database),
    ).rejects.toThrow('not a Voice Notes backup');
  });
});
