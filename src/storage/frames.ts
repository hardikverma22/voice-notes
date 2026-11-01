import { db, type Frame, type Stroke } from './db';

export type FrameInput = Omit<Frame, 'id' | 'createdAt' | 'strokes' | 'noteId' | 'sessionId'>;

/** Stores a frame taken during a running recording. */
export async function addSessionFrame(
  sessionId: string,
  input: FrameInput,
  database = db,
): Promise<Frame> {
  const frame: Frame = {
    ...input,
    id: crypto.randomUUID(),
    noteId: null,
    sessionId,
    strokes: [],
    createdAt: Date.now(),
  };
  await database.frames.add(frame);
  return frame;
}

/**
 * Moves a finished recording's frames onto its note. offsetSec shifts their times when the
 * recording was added to the end of existing audio. Returns how many frames moved.
 */
export async function adoptSessionFrames(
  sessionId: string,
  noteId: string,
  offsetSec = 0,
  database = db,
): Promise<number> {
  return database.frames
    .where('sessionId')
    .equals(sessionId)
    .modify((frame) => {
      frame.noteId = noteId;
      frame.sessionId = null;
      frame.t += offsetSec;
    });
}

export async function discardSessionFrames(sessionId: string, database = db): Promise<void> {
  await database.frames.where('sessionId').equals(sessionId).delete();
}

export async function countSessionFrames(sessionId: string, database = db): Promise<number> {
  return database.frames.where('sessionId').equals(sessionId).count();
}

/** A note's frames in time order. */
export async function listNoteFrames(noteId: string, database = db): Promise<Frame[]> {
  const frames = await database.frames.where('noteId').equals(noteId).toArray();
  return frames.sort((a, b) => a.t - b.t || a.createdAt - b.createdAt);
}

export async function setFrameStrokes(id: string, strokes: Stroke[], database = db): Promise<void> {
  await database.frames.update(id, { strokes });
}

export async function deleteFrame(id: string, database = db): Promise<Frame | undefined> {
  return database.transaction('rw', database.frames, async () => {
    const frame = await database.frames.get(id);
    if (frame) await database.frames.delete(id);
    return frame;
  });
}

export async function restoreFrame(frame: Frame, database = db): Promise<void> {
  await database.frames.put(frame);
}

/** How many frames each note has. Reads only the index, not the images. */
export async function frameCountsByNote(database = db): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const keys = await database.frames.orderBy('noteId').keys();
  for (const key of keys) {
    if (typeof key !== 'string') continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** A note's screen text for search: each frame's text, in time order. */
export function screenTextOf(frames: Pick<Frame, 't' | 'text'>[]): string {
  return [...frames]
    .sort((a, b) => a.t - b.t)
    .map((frame) => frame.text?.trim() ?? '')
    .filter(Boolean)
    .join('\n\n');
}

/** Stores the text read from a frame, and refreshes its note's screen text. */
export async function setFrameText(id: string, text: string, database = db): Promise<void> {
  await database.transaction('rw', [database.frames, database.notes], async () => {
    const frame = await database.frames.get(id);
    if (!frame) return;
    await database.frames.update(id, { text });
    if (!frame.noteId) return;
    const frames = await database.frames.where('noteId').equals(frame.noteId).toArray();
    await database.notes.update(frame.noteId, { screenText: screenTextOf(frames) });
  });
}

/** Adopted frames whose text has not been read yet, oldest first. */
export async function listUnreadFrames(database = db): Promise<Frame[]> {
  const frames = await database.frames
    .filter((f) => f.noteId !== null && f.text === undefined)
    .toArray();
  return frames.sort((a, b) => a.createdAt - b.createdAt);
}
