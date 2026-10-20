import { Dexie, type EntityTable } from 'dexie';
import type { Segment } from '../features/transcribe/protocol';

export interface Note {
  id: string; // crypto.randomUUID()
  title: string;
  contentJson: string; // JSON.stringify(editor.getJSON())
  plainText: string; // editor.getText(), for search and the list preview
  segments: Segment[]; // from the final pass, absolute seconds
  audioId: string | null;
  durationMs: number;
  language: string; // 'english' in v1
  modelId: string; // MODEL_ID at transcription time
  device: 'webgpu' | 'wasm';
  createdAt: number; // Date.now()
  updatedAt: number;
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
  }
}
export const db = new VoiceNotesDB();
