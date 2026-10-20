import { db, type AudioRecord, type Note, type NoteStatus } from './db';
import type { Segment } from '../features/transcribe/protocol';

export type NoteInput = Omit<
  Note,
  'id' | 'createdAt' | 'updatedAt' | 'pinned' | 'status' | 'autoTitle'
> &
  Partial<Pick<Note, 'pinned' | 'status' | 'autoTitle'>>;

export async function createNote(input: NoteInput, database = db): Promise<Note> {
  const now = Date.now();
  const note: Note = {
    pinned: false,
    status: 'ready',
    autoTitle: false,
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

export async function setNoteAudio(id: string, audioId: string, database = db): Promise<void> {
  await database.notes.update(id, { audioId, updatedAt: Date.now() });
}

/** Pinning does not count as an edit, so updatedAt is left alone. */
export async function setPinned(id: string, pinned: boolean, database = db): Promise<void> {
  await database.notes.update(id, { pinned });
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
      });
      added++;
    }
  });
  return added;
}
