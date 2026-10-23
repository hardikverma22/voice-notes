import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { extensionFor } from '../features/recorder/mime';
import { db, type AudioRecord, type Note } from './db';
import { importBackup } from './notes';

/**
 * Full backup: a zip with manifest.json (every note) and audio/<id>.<ext> (every recording).
 * Loaded on demand from Settings, so the zip code stays out of the main bundle.
 */

const FORMAT = 'voice-notes-backup';
const MANIFEST = 'manifest.json';

interface AudioEntry {
  id: string;
  noteId: string;
  mimeType: string;
  createdAt: number;
  path: string;
}

interface Manifest {
  format: typeof FORMAT;
  version: 2;
  exportedAt: number;
  notes: Note[];
  audio: AudioEntry[];
}

export interface BackupSummary {
  notes: number;
  recordings: number;
}

export async function exportZipBackup(database = db): Promise<{ blob: Blob } & BackupSummary> {
  const notes = await database.notes.toArray();
  const audio = await database.audio.toArray();
  const files: Zippable = {};
  const entries: AudioEntry[] = [];
  for (const record of audio) {
    const path = `audio/${record.id}.${extensionFor(record.mimeType)}`;
    // Audio is already compressed (or WAV, which barely shrinks); store it as is.
    files[path] = [new Uint8Array(await record.blob.arrayBuffer()), { level: 0 }];
    entries.push({
      id: record.id,
      noteId: record.noteId,
      mimeType: record.mimeType,
      createdAt: record.createdAt,
      path,
    });
  }
  const manifest: Manifest = {
    format: FORMAT,
    version: 2,
    exportedAt: Date.now(),
    notes,
    audio: entries,
  };
  files[MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = zipSync(files, { level: 6 });
  return {
    blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    notes: notes.length,
    recordings: entries.length,
  };
}

/**
 * Restores a zip made by exportZipBackup, or a text-only .json backup from older versions.
 * Notes whose id already exists are skipped along with their audio, so importing twice is safe.
 */
export async function importAnyBackup(file: File, database = db): Promise<BackupSummary> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // "PK"
  if (!isZip) {
    return { notes: await importBackup(new TextDecoder().decode(bytes), database), recordings: 0 };
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('This zip file could not be read. It may be damaged.');
  }
  const raw = files[MANIFEST];
  if (!raw) throw new Error('This zip is not a Voice Notes backup.');
  let manifest: Partial<Manifest>;
  try {
    manifest = JSON.parse(strFromU8(raw)) as Partial<Manifest>;
  } catch {
    throw new Error('The backup manifest is damaged.');
  }
  if (manifest.format !== FORMAT || !Array.isArray(manifest.notes)) {
    throw new Error('This zip is not a Voice Notes backup.');
  }

  const audioByNote = new Map<string, AudioEntry[]>();
  for (const entry of manifest.audio ?? []) {
    const list = audioByNote.get(entry.noteId);
    if (list) list.push(entry);
    else audioByNote.set(entry.noteId, [entry]);
  }

  let notes = 0;
  let recordings = 0;
  await database.transaction('rw', [database.notes, database.audio], async () => {
    for (const note of manifest.notes ?? []) {
      if (!note?.id || typeof note.contentJson !== 'string') continue;
      if (await database.notes.get(note.id)) continue;
      const records: AudioRecord[] = [];
      for (const entry of audioByNote.get(note.id) ?? []) {
        const data = files[entry.path];
        if (!data) continue;
        const blob = new Blob([data as Uint8Array<ArrayBuffer>], { type: entry.mimeType });
        records.push({
          id: entry.id,
          noteId: note.id,
          blob,
          mimeType: entry.mimeType,
          sizeBytes: blob.size,
          createdAt: entry.createdAt,
        });
      }
      const audioId =
        note.audioId && records.some((r) => r.id === note.audioId) ? note.audioId : null;
      await database.notes.add({
        ...note,
        audioId,
        tags: Array.isArray(note.tags) ? note.tags : [],
        bookmarks: Array.isArray(note.bookmarks) ? note.bookmarks : [],
        pendingAppend: null,
        // A note mid-transcription when backed up is restored as is; its text was kept.
        status: note.status === 'ready' || !audioId ? 'ready' : 'failed',
      });
      if (records.length > 0) await database.audio.bulkPut(records);
      notes++;
      recordings += records.length;
    }
  });
  return { notes, recordings };
}
