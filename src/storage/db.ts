import { Dexie, type EntityTable } from 'dexie';
import type { Segment } from '../features/transcribe/protocol';

/**
 * ready: transcript is final. queued: waiting for the speech model or its turn.
 * transcribing: the final pass is running. failed: the final pass threw; audio is kept.
 */
export type NoteStatus = 'ready' | 'queued' | 'transcribing' | 'failed';

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

export class VoiceNotesDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  audio!: EntityTable<AudioRecord, 'id'>;
  audioChunks!: EntityTable<AudioChunk, 'seq'>;
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
  }
}
export const db = new VoiceNotesDB();
