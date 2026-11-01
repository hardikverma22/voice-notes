import { Dexie, type EntityTable } from 'dexie';
import type { Segment } from '../features/transcribe/protocol';

/**
 * ready: transcript is final. queued: waiting for the speech model or its turn.
 * transcribing: the final pass is running. failed: the final pass threw; audio is kept.
 */
export type NoteStatus = 'ready' | 'queued' | 'transcribing' | 'failed';

/** A moment in the recording the person marked, in seconds from the start of the audio. */
export interface Bookmark {
  id: string;
  t: number;
  label: string;
  createdAt: number;
}

export interface Note {
  id: string; // crypto.randomUUID()
  title: string;
  contentJson: string; // JSON.stringify(editor.getJSON())
  plainText: string; // editor.getText(), for search and the list preview
  segments: Segment[]; // from the final pass, absolute seconds
  audioId: string | null;
  durationMs: number;
  language: string;
  modelId: string; // MODEL_ID at transcription time
  device: 'webgpu' | 'wasm';
  createdAt: number; // Date.now()
  updatedAt: number;
  pinned: boolean;
  status: NoteStatus;
  /** True while the title is still the generated one, so a transcript may replace it. */
  autoTitle: boolean;
  tags: string[];
  bookmarks: Bookmark[];
  /**
   * Set while a recording added to this note waits for its transcript. offsetSec is where the
   * added audio starts, so only that part is transcribed and appended to the existing text.
   */
  pendingAppend: { offsetSec: number } | null;
  /** Text read from the note's screen frames, for search. Derived from the frames. */
  screenText?: string;
}
export interface AudioRecord {
  id: string;
  noteId: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}
export interface AudioChunk {
  seq?: number;
  sessionId: string;
  index: number;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

/**
 * A searchable passage of a note and its embedding. Derived data: the search indexer owns it,
 * rebuilds it from the notes at any time, and backups leave it out.
 */
export interface SearchChunk {
  id: string; // `${noteId}:${index}`
  noteId: string;
  text: string;
  start: number | null;
  vector: Float32Array;
}
/** What a note's chunks were built from, so the indexer can tell when they are stale. */
export interface SearchIndexEntry {
  noteId: string;
  hash: string;
  indexedAt: number;
}

/** One mark drawn over a frame. Points are 0..1 of the frame's width and height. */
export interface Stroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'arrow' | 'box';
  color: string;
  points: [number, number][];
}

/**
 * A still of the shared screen, taken while recording. t is seconds from the start of the
 * note's audio. sessionId is set while the recording is running, so an interrupted recording
 * keeps its frames; noteId is set once the recording is saved.
 */
export interface Frame {
  id: string;
  noteId: string | null;
  sessionId: string | null;
  t: number;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  /** auto: the screen changed. manual: the person took it. */
  source: 'auto' | 'manual';
  strokes: Stroke[];
  createdAt: number;
  /** Text read from the frame on this device. Undefined until read; '' when there is none. */
  text?: string;
}

export class VoiceNotesDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  audio!: EntityTable<AudioRecord, 'id'>;
  audioChunks!: EntityTable<AudioChunk, 'seq'>;
  searchChunks!: EntityTable<SearchChunk, 'id'>;
  searchIndex!: EntityTable<SearchIndexEntry, 'noteId'>;
  frames!: EntityTable<Frame, 'id'>;
  constructor(name = 'voice-notes') {
    super(name);
    this.version(1).stores({
      notes: 'id, createdAt, updatedAt',
      audio: 'id, noteId',
      audioChunks: '++seq, sessionId, [sessionId+index]',
    });
    this.version(2)
      .stores({
        notes: 'id, createdAt, updatedAt, status',
        audio: 'id, noteId',
        audioChunks: '++seq, sessionId, [sessionId+index]',
      })
      .upgrade((tx) =>
        tx
          .table('notes')
          .toCollection()
          .modify((note: Partial<Note>) => {
            note.pinned ??= false;
            note.status ??= 'ready';
            note.autoTitle ??= false;
          }),
      );
    this.version(3)
      .stores({
        notes: 'id, createdAt, updatedAt, status, *tags',
        audio: 'id, noteId',
        audioChunks: '++seq, sessionId, [sessionId+index]',
      })
      .upgrade((tx) =>
        tx
          .table('notes')
          .toCollection()
          .modify((note: Partial<Note>) => {
            note.tags ??= [];
            note.bookmarks ??= [];
            note.pendingAppend ??= null;
          }),
      );
    this.version(4).stores({
      notes: 'id, createdAt, updatedAt, status, *tags',
      audio: 'id, noteId',
      audioChunks: '++seq, sessionId, [sessionId+index]',
      searchChunks: 'id, noteId',
      searchIndex: 'noteId',
    });
    this.version(5).stores({
      notes: 'id, createdAt, updatedAt, status, *tags',
      audio: 'id, noteId',
      audioChunks: '++seq, sessionId, [sessionId+index]',
      searchChunks: 'id, noteId',
      searchIndex: 'noteId',
      frames: 'id, noteId, sessionId',
    });
  }
}
export const db = new VoiceNotesDB();
