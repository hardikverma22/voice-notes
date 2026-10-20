import { Dexie } from 'dexie';
import { db, type AudioChunk, type AudioRecord } from './db';

export async function appendChunk(
  sessionId: string,
  index: number,
  blob: Blob,
  mimeType: string,
  database = db,
): Promise<void> {
  const chunk: AudioChunk = { sessionId, index, blob, mimeType, createdAt: Date.now() };
  await database.audioChunks.add(chunk);
}

/** Joins a session's chunks (in index order) into one stored audio record. */
export async function finalizeSession(
  sessionId: string,
  noteId: string,
  database = db,
): Promise<AudioRecord> {
  return database.transaction('rw', [database.audioChunks, database.audio], async () => {
    const chunks = await database.audioChunks
      .where('[sessionId+index]')
      .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
      .toArray();
    const mimeType = chunks[0]?.mimeType || 'audio/webm';
    const blob = new Blob(
      chunks.map((chunk) => chunk.blob),
      { type: mimeType },
    );
    const record: AudioRecord = {
      id: crypto.randomUUID(),
      noteId,
      blob,
      mimeType,
      sizeBytes: blob.size,
      createdAt: Date.now(),
    };
    await database.audio.add(record);
    const keys = chunks.map((chunk) => chunk.seq).filter((seq): seq is number => seq !== undefined);
    await database.audioChunks.bulkDelete(keys);
    return record;
  });
}

export async function listOrphanSessions(database = db): Promise<string[]> {
  const chunks = await database.audioChunks.toArray();
  return [...new Set(chunks.map((chunk) => chunk.sessionId))];
}

export async function discardSession(sessionId: string, database = db): Promise<void> {
  await database.audioChunks.where('sessionId').equals(sessionId).delete();
}

export function getAudio(id: string, database = db): Promise<AudioRecord | undefined> {
  return database.audio.get(id);
}

/** Storage estimate, or null where the Storage API is unavailable. */
export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  if (usage === undefined || quota === undefined) return null;
  return { usage, quota };
}
