import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { extensionFor } from '../features/recorder/mime';
import { db, type AudioRecord, type Frame, type Note } from './db';
import { importBackup } from './notes';

/**
 * Full backup: a zip with manifest.json (every note), audio/<id>.<ext> (every recording) and
 * frames/<id>.<ext> (every screen frame, with its drawing kept as data).
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

/** A frame without its image, which is stored at path. */
type FrameEntry = Omit<Frame, 'blob' | 'sessionId'> & { path: string };

interface Manifest {
  format: typeof FORMAT;
  /** 2: notes and audio. 3: adds frames. */
  version: 2 | 3;
  exportedAt: number;
  notes: Note[];
  audio: AudioEntry[];
  frames?: FrameEntry[];
}

export interface BackupSummary {
  notes: number;
  recordings: number;
  frames?: number;
}

const IMAGE_EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
};

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
  // Frames of a recording still running belong to no note yet; they are left out.
  const frames = (await database.frames.toArray()).filter((frame) => frame.noteId);
  const frameEntries: FrameEntry[] = [];
  for (const frame of frames) {
    const path = `frames/${frame.id}.${IMAGE_EXT[frame.mimeType] ?? 'img'}`;
    files[path] = [new Uint8Array(await frame.blob.arrayBuffer()), { level: 0 }];
    frameEntries.push({
      id: frame.id,
      noteId: frame.noteId,
      t: frame.t,
      mimeType: frame.mimeType,
      width: frame.width,
      height: frame.height,
      source: frame.source,
      strokes: frame.strokes,
      createdAt: frame.createdAt,
      text: frame.text,
      path,
    });
  }
  const manifest: Manifest = {
    format: FORMAT,
    version: 3,
    exportedAt: Date.now(),
    notes,
    audio: entries,
    frames: frameEntries,
  };
  files[MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));
  const zipped = zipSync(files, { level: 6 });
  return {
    blob: new Blob([zipped as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    notes: notes.length,
    recordings: entries.length,
    frames: frameEntries.length,
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

  const framesByNote = new Map<string, FrameEntry[]>();
  for (const entry of manifest.frames ?? []) {
    if (!entry?.noteId) continue;
    const list = framesByNote.get(entry.noteId);
    if (list) list.push(entry);
    else framesByNote.set(entry.noteId, [entry]);
  }

  let notes = 0;
  let recordings = 0;
  let frameCount = 0;
  const tables = [database.notes, database.audio, database.frames];
  await database.transaction('rw', tables, async () => {
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
      const frames: Frame[] = [];
      for (const { path, ...entry } of framesByNote.get(note.id) ?? []) {
        const data = files[path];
        if (!data) continue;
        frames.push({
          ...entry,
          sessionId: null,
          strokes: Array.isArray(entry.strokes) ? entry.strokes : [],
          blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: entry.mimeType }),
        });
      }
      if (frames.length > 0) await database.frames.bulkPut(frames);
      notes++;
      recordings += records.length;
      frameCount += frames.length;
    }
  });
  return { notes, recordings, frames: frameCount };
}
