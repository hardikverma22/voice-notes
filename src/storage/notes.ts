import { db, type AudioRecord, type Note } from './db';

export type NoteInput = Omit<Note, 'id' | 'createdAt' | 'updatedAt'>;

export async function createNote(input: NoteInput, database = db): Promise<Note> {
  const now = Date.now();
  const note: Note = { ...input, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
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
  await database.notes.update(id, { ...content, updatedAt: Date.now() });
}

export async function setNoteAudio(id: string, audioId: string, database = db): Promise<void> {
  await database.notes.update(id, { audioId, updatedAt: Date.now() });
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

export function listNotes(database = db): Promise<Note[]> {
  return database.notes.orderBy('updatedAt').reverse().toArray();
}
