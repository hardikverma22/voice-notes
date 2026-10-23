import { liveQuery } from 'dexie';
import { useSyncExternalStore } from 'react';
import { db, type Note, type SearchChunk } from '../../storage/db';
import { isWhisperBusy } from '../transcribe/modelStore';
import { chunkNote, contentHash } from './chunk';
import { EMBED_MODEL_ID } from './config';
import { embed } from './embedStore';

/**
 * Keeps the search index in step with the notes: chunks and embeds notes whose text changed,
 * removes passages of deleted notes, and resumes after a reload (the stored hash says what is
 * done). It waits while Whisper works, so recording and transcription never compete with it.
 */

const BATCH = 16;
const SETTLE_MS = 1500;

export interface IndexState {
  /** Notes with passages in the index. */
  indexed: number;
  /** Notes that can be indexed (ready, with text). */
  total: number;
  running: boolean;
  /** Bumped whenever stored vectors change, so readers can drop their caches. */
  version: number;
}

let state: IndexState = { indexed: 0, total: 0, running: false, version: 0 };
const listeners = new Set<() => void>();
function set(next: Partial<IndexState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function noteHash(note: Pick<Note, 'title' | 'plainText'>): string {
  return contentHash(EMBED_MODEL_ID, note.title, note.plainText);
}

function indexable(note: Note): boolean {
  return note.status === 'ready' && Boolean(note.title.trim() || note.plainText.trim());
}

let subscription: { unsubscribe(): void } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let stopped = true;
let pass: Promise<void> | null = null;
let again = false;

/** Starts watching the notes. Safe to call more than once. */
export function startIndexer(): void {
  if (!stopped) return;
  stopped = false;
  subscription = liveQuery(() => db.notes.toArray()).subscribe({
    next: () => schedule(),
    error: (error: unknown) => console.error('Search indexer could not read notes', error),
  });
}

export function stopIndexer(): void {
  stopped = true;
  subscription?.unsubscribe();
  subscription = null;
  clearTimeout(timer);
  set({ running: false });
}

function schedule(delay = SETTLE_MS): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (pass) {
      again = true;
      return;
    }
    pass = runPass().finally(() => {
      pass = null;
      if (again && !stopped) {
        again = false;
        schedule(0);
      }
    });
  }, delay);
}

async function waitForWhisper(): Promise<void> {
  while (isWhisperBusy() && !stopped) await new Promise((r) => setTimeout(r, 2000));
}

async function runPass(): Promise<void> {
  const notes = await db.notes.toArray();
  const entries = new Map((await db.searchIndex.toArray()).map((e) => [e.noteId, e.hash]));
  const live = new Set(notes.map((n) => n.id));

  // Passages of deleted notes (or of notes emptied out) go first: they hold note text.
  const gone = [...entries.keys()].filter((id) => !live.has(id));
  const emptied = notes.filter((n) => !indexable(n) && n.status === 'ready' && entries.has(n.id));
  const toRemove = [...gone, ...emptied.map((n) => n.id)];
  if (toRemove.length) {
    await db.transaction('rw', db.searchChunks, db.searchIndex, async () => {
      await db.searchChunks.where('noteId').anyOf(toRemove).delete();
      await db.searchIndex.bulkDelete(toRemove);
    });
    for (const id of toRemove) entries.delete(id);
    set({ version: state.version + 1 });
  }

  const candidates = notes.filter(indexable);
  const stale = candidates
    .filter((n) => entries.get(n.id) !== noteHash(n))
    // Newest first: what someone just recorded is what they are likely to look for.
    .sort((a, b) => b.updatedAt - a.updatedAt);
  set({ total: candidates.length, indexed: candidates.length - stale.length });
  if (stale.length === 0) return;

  set({ running: true });
  try {
    for (const note of stale) {
      if (stopped) return;
      await waitForWhisper();
      await indexNote(note);
      set({ indexed: state.indexed + 1, version: state.version + 1 });
    }
  } catch (error) {
    // The model failed or search was turned off; the next change retries.
    console.error('Search indexing stopped', error);
  } finally {
    set({ running: false });
  }
}

async function indexNote(note: Note): Promise<void> {
  const chunks = chunkNote(note);
  const vectors: Float32Array[] = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    vectors.push(...(await embed(chunks.slice(i, i + BATCH).map((c) => c.text))));
  }
  const rows: SearchChunk[] = chunks.map((chunk, index) => ({
    id: `${note.id}:${index}`,
    noteId: note.id,
    text: chunk.text,
    start: chunk.start,
    vector: vectors[index]!,
  }));
  await db.transaction('rw', db.notes, db.searchChunks, db.searchIndex, async () => {
    // Skip if the note changed or vanished while it was being embedded; the next pass redoes it.
    const current = await db.notes.get(note.id);
    if (!current || noteHash(current) !== noteHash(note)) return;
    await db.searchChunks.where('noteId').equals(note.id).delete();
    await db.searchChunks.bulkAdd(rows);
    await db.searchIndex.put({ noteId: note.id, hash: noteHash(note), indexedAt: Date.now() });
  });
}

/** Drops the whole index. Used when search is turned off or rebuilt. */
export async function clearSearchIndex(): Promise<void> {
  await db.transaction('rw', db.searchChunks, db.searchIndex, async () => {
    await db.searchChunks.clear();
    await db.searchIndex.clear();
  });
  set({ indexed: 0, version: state.version + 1 });
  if (!stopped) schedule(0);
}

export function getIndexState(): IndexState {
  return state;
}

export function useIndexState(): IndexState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getIndexState,
    getIndexState,
  );
}
