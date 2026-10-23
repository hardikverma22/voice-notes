import { db, type AudioRecord, type Bookmark, type Note, type NoteStatus } from './db';
import type { Segment } from '../features/transcribe/protocol';
import { normalizeTag } from '../lib/tags';

type Defaulted = 'pinned' | 'status' | 'autoTitle' | 'tags' | 'bookmarks' | 'pendingAppend';
export type NoteInput = Omit<Note, 'id' | 'createdAt' | 'updatedAt' | Defaulted> &
  Partial<Pick<Note, Defaulted>>;

export async function createNote(input: NoteInput, database = db): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    pinned: false,
    status: 'ready',
    autoTitle: false,
    tags: [],
    bookmarks: [],
    pendingAppend: null,
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await database.notes.add(note);
  return note;
}

export function getNote(id: string, database = db): Promise<Note | undefined> {
  return database.notes.get(id);
}

export async function updateNoteContent(
  id: string,
  content: { contentJson: string; plainText: string; title: string },
  database = db,
): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const current = await database.notes.get(id);
    if (!current) return;
    await database.notes.update(id, {
      ...content,
      autoTitle: current.autoTitle && current.title === content.title,
      updatedAt: Date.now(),
    });
  });
}

/** A title the person chose, so a later transcript will not replace it. */
export async function renameNote(id: string, title: string, database = db): Promise<void> {
  await database.notes.update(id, {
    title: title.replace(/\s+/g, ' ').trim(),
    autoTitle: false,
    updatedAt: Date.now(),
  });
}

export async function setNoteAudio(id: string, audioId: string, database = db): Promise<void> {
  await database.notes.update(id, { audioId, updatedAt: Date.now() });
}

/** Pinning does not count as an edit, so updatedAt is left alone. */
export async function setPinned(id: string, pinned: boolean, database = db): Promise<void> {
  await database.notes.update(id, { pinned });
}

/** Tags are organisation, not an edit, so updatedAt is left alone. */
export async function setTags(id: string, tags: string[], database = db): Promise<void> {
  const clean: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag && !clean.some((t) => t.toLowerCase() === tag.toLowerCase())) clean.push(tag);
  }
  await database.notes.update(id, { tags: clean });
}

/** Adds a bookmark, keeping the list in time order. Returns it so the caller can focus its label. */
export async function addBookmark(
  id: string,
  t: number,
  label = '',
  database = db,
): Promise<Bookmark | null> {
  const bookmark: Bookmark = {
    id: crypto.randomUUID(),
    t: Math.max(0, t),
    label,
    createdAt: Date.now(),
  };
  const done = await database.transaction('rw', database.notes, async () => {
    const note = await database.notes.get(id);
    if (!note) return false;
    const bookmarks = [...(note.bookmarks ?? []), bookmark].sort((a, b) => a.t - b.t);
    await database.notes.update(id, { bookmarks });
    return true;
  });
  return done ? bookmark : null;
}

export async function updateBookmark(
  id: string,
  bookmarkId: string,
  label: string,
  database = db,
): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const note = await database.notes.get(id);
    if (!note) return;
    await database.notes.update(id, {
      bookmarks: note.bookmarks.map((b) => (b.id === bookmarkId ? { ...b, label } : b)),
    });
  });
}

/** Returns the removed bookmark for undo. */
export async function removeBookmark(
  id: string,
  bookmarkId: string,
  database = db,
): Promise<Bookmark | null> {
  return database.transaction('rw', database.notes, async () => {
    const note = await database.notes.get(id);
    const removed = note?.bookmarks.find((b) => b.id === bookmarkId);
    if (!note || !removed) return null;
    await database.notes.update(id, {
      bookmarks: note.bookmarks.filter((b) => b.id !== bookmarkId),
    });
    return removed;
  });
}

export async function restoreBookmark(
  id: string,
  bookmark: Bookmark,
  database = db,
): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const note = await database.notes.get(id);
    if (!note || note.bookmarks.some((b) => b.id === bookmark.id)) return;
    await database.notes.update(id, {
      bookmarks: [...note.bookmarks, bookmark].sort((a, b) => a.t - b.t),
    });
  });
}

export async function setNoteStatus(id: string, status: NoteStatus, database = db): Promise<void> {
  await database.notes.update(id, { status });
}

/** Writes a finished transcript. The title is only replaced while it is still generated. */
export async function applyTranscript(
  id: string,
  result: {
    contentJson: string;
    plainText: string;
    segments: Segment[];
    title: string;
    language: string;
    modelId: string;
    device: 'webgpu' | 'wasm';
    /** Used only when the note has no duration yet (recovered recordings). */
    durationMs?: number;
  },
  database = db,
): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const current = await database.notes.get(id);
    if (!current) return;
    const { title, durationMs, ...rest } = result;
    await database.notes.update(id, {
      ...rest,
      durationMs: current.durationMs || durationMs || 0,
      title: current.autoTitle ? title : current.title,
      status: 'ready',
      updatedAt: Date.now(),
    });
  });
}

/**
 * Points the note at its merged audio and marks the added part for transcription. Bookmarks
 * made while recording arrive already shifted to the merged timeline.
 */
export async function startAppend(
  id: string,
  change: { audioId: string; durationMs: number; offsetSec: number; bookmarks: Bookmark[] },
  database = db,
): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const note = await database.notes.get(id);
    if (!note) return;
    await database.notes.update(id, {
      audioId: change.audioId,
      durationMs: change.durationMs,
      pendingAppend: { offsetSec: change.offsetSec },
      bookmarks: [...note.bookmarks, ...change.bookmarks].sort((a, b) => a.t - b.t),
      status: 'queued',
      updatedAt: Date.now(),
    });
  });
}

interface DocLike {
  type: 'doc';
  content: unknown[];
}

function isEmptyParagraph(node: unknown): boolean {
  const n = node as { type?: string; content?: unknown[] };
  return n.type === 'paragraph' && !n.content?.length;
}

/**
 * Adds the transcript of an appended recording after the existing text, keeping every edit
 * the person made. Segments must already be on the merged audio's timeline.
 */
export async function applyAppendedTranscript(
  id: string,
  result: {
    doc: DocLike;
    plainText: string;
    segments: Segment[];
    /** Used only while the note is still empty and its title generated. */
    title: string;
  },
  database = db,
): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const current = await database.notes.get(id);
    if (!current) return;
    let doc: DocLike = { type: 'doc', content: [] };
    try {
      const parsed = JSON.parse(current.contentJson) as Partial<DocLike>;
      if (Array.isArray(parsed.content)) doc = { type: 'doc', content: parsed.content };
    } catch {
      // Unreadable content is replaced by the new text below.
    }
    const kept = doc.content.filter(
      (node, i, all) => !(i === all.length - 1 && isEmptyParagraph(node)),
    );
    const added = result.doc.content.filter((node) => !isEmptyParagraph(node));
    const wasEmpty = !current.plainText.trim();
    await database.notes.update(id, {
      contentJson: JSON.stringify({ type: 'doc', content: [...kept, ...added] }),
      plainText: [current.plainText.trim(), result.plainText.trim()].filter(Boolean).join('\n\n'),
      segments: [...current.segments, ...result.segments],
      title: current.autoTitle && wasEmpty ? result.title : current.title,
      pendingAppend: null,
      status: 'ready',
      updatedAt: Date.now(),
    });
  });
}

/** Deletes the note and its audio in one transaction. Returns the removed records for undo. */
export async function deleteNote(
  id: string,
  database = db,
): Promise<{ note: Note; audio: AudioRecord[] } | null> {
  return database.transaction('rw', [database.notes, database.audio], async () => {
    const note = await database.notes.get(id);
    if (!note) return null;
    const audio = await database.audio.where('noteId').equals(id).toArray();
    await database.notes.delete(id);
    await database.audio.where('noteId').equals(id).delete();
    return { note, audio };
  });
}

export async function restoreNote(
  removed: { note: Note; audio: AudioRecord[] },
  database = db,
): Promise<void> {
  await database.transaction('rw', [database.notes, database.audio], async () => {
    await database.notes.put(removed.note);
    if (removed.audio.length > 0) await database.audio.bulkPut(removed.audio);
  });
}

/** Newest recording first. */
export function listNotes(database = db): Promise<Note[]> {
  return database.notes.orderBy('createdAt').reverse().toArray();
}

export function listUnfinishedNotes(database = db): Promise<Note[]> {
  return database.notes.where('status').anyOf('queued', 'transcribing').sortBy('createdAt');
}

export async function deleteAllNotes(database = db): Promise<void> {
  await database.transaction('rw', [database.notes, database.audio], async () => {
    await database.notes.clear();
    await database.audio.clear();
  });
}

const BACKUP_FORMAT = 'voice-notes-backup';

/** Text-only backup of every note (audio is not included). */
export async function exportBackup(database = db): Promise<string> {
  const notes = await database.notes.toArray();
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: Date.now(),
      notes: notes.map((note) => ({ ...note, audioId: null })),
    },
    null,
    2,
  );
}

/** Imports a backup made by exportBackup. Notes with an existing id are skipped. */
export async function importBackup(json: string, database = db): Promise<number> {
  const data = JSON.parse(json) as { format?: string; notes?: Partial<Note>[] };
  if (data.format !== BACKUP_FORMAT || !Array.isArray(data.notes)) {
    throw new Error('This file is not a Voice Notes backup.');
  }
  let added = 0;
  await database.transaction('rw', database.notes, async () => {
    for (const raw of data.notes ?? []) {
      if (!raw.id || typeof raw.contentJson !== 'string') continue;
      if (await database.notes.get(raw.id)) continue;
      const now = Date.now();
      await database.notes.add({
        id: raw.id,
        title: raw.title ?? 'Imported note',
        contentJson: raw.contentJson,
        plainText: raw.plainText ?? '',
        segments: raw.segments ?? [],
        audioId: null,
        durationMs: raw.durationMs ?? 0,
        language: raw.language ?? 'english',
        modelId: raw.modelId ?? 'import',
        device: raw.device ?? 'wasm',
        createdAt: raw.createdAt ?? now,
        updatedAt: raw.updatedAt ?? now,
        pinned: raw.pinned ?? false,
        status: 'ready',
        autoTitle: false,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        bookmarks: Array.isArray(raw.bookmarks) ? raw.bookmarks : [],
        pendingAppend: null,
      });
      added++;
    }
  });
  return added;
}
