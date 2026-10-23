import { useSyncExternalStore } from 'react';
import { getAudioForNote } from '../../storage/audio';
import {
  applyAppendedTranscript,
  applyTranscript,
  getNote,
  listUnfinishedNotes,
  setNoteStatus,
} from '../../storage/notes';
import { titleFromTranscript } from '../notes/title';
import { transcriptToDoc } from '../notes/transcriptToDoc';
import { decodeToPcm16k } from '../recorder/decode';
import { LANGUAGE, MODEL_ID, SAMPLE_RATE } from './config';
import { joinSegments } from './merge';
import { getModelState, transcribe, whenModelReady } from './modelStore';

/**
 * Runs the final transcription pass for saved notes, one at a time. A note is saved before it
 * is transcribed, so nothing is lost if the tab closes: unfinished notes resume on next start,
 * decoding the stored audio when the in-memory samples are gone. A recording added to an
 * existing note (pendingAppend) only has its new part transcribed, appended after the text.
 */

const pcmByNote = new Map<string, Float32Array>();
const queue: string[] = [];
let running = false;
let activeId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** For an appended recording, pcm is only the added part. */
export function enqueueTranscription(noteId: string, pcm?: Float32Array): void {
  if (pcm) pcmByNote.set(noteId, pcm);
  if (queue.includes(noteId) || activeId === noteId) return;
  queue.push(noteId);
  void setNoteStatus(noteId, 'queued');
  emit();
  void pump();
}

let resumed = false;
/** Re-queues notes left queued or transcribing by an earlier visit. */
export async function resumeUnfinished(): Promise<void> {
  if (resumed) return;
  resumed = true;
  for (const note of await listUnfinishedNotes()) enqueueTranscription(note.id);
}

async function pump(): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let id = queue.shift(); id; id = queue.shift()) {
      activeId = id;
      emit();
      await runOne(id);
      pcmByNote.delete(id);
    }
  } finally {
    activeId = null;
    running = false;
    emit();
  }
}

async function runOne(noteId: string): Promise<void> {
  try {
    await whenModelReady();
    const note = await getNote(noteId);
    if (!note) return;
    await setNoteStatus(noteId, 'transcribing');

    const offsetSec = note.pendingAppend?.offsetSec ?? null;
    let pcm = pcmByNote.get(noteId);
    if (!pcm) {
      const audio = await getAudioForNote(noteId);
      if (!audio) throw new Error('No audio stored for this note.');
      pcm = await decodeToPcm16k(audio.blob);
      if (offsetSec !== null) pcm = pcm.subarray(Math.round(offsetSec * SAMPLE_RATE));
    }

    const result = await transcribe('final', pcm);
    const text = joinSegments(result.chunks) || result.text.trim();
    if (offsetSec !== null) {
      await applyAppendedTranscript(noteId, {
        doc: transcriptToDoc(text),
        plainText: text,
        segments: result.chunks.map((segment) => ({
          ...segment,
          start: segment.start + offsetSec,
          end: segment.end === null ? null : segment.end + offsetSec,
        })),
        title: titleFromTranscript(text, note.createdAt),
      });
      return;
    }
    await applyTranscript(noteId, {
      contentJson: JSON.stringify(transcriptToDoc(text)),
      plainText: text,
      segments: result.chunks,
      title: titleFromTranscript(text, note.createdAt),
      language: LANGUAGE,
      modelId: MODEL_ID,
      device: getModelState().device ?? 'wasm',
      durationMs: Math.round((pcm.length / SAMPLE_RATE) * 1000),
    });
  } catch (error) {
    console.error('Transcription failed', error);
    await setNoteStatus(noteId, 'failed').catch(() => undefined);
  }
}

export interface QueueState {
  activeId: string | null;
  waiting: number;
}

let snapshot: QueueState = { activeId: null, waiting: 0 };
function getSnapshot(): QueueState {
  if (snapshot.activeId !== activeId || snapshot.waiting !== queue.length) {
    snapshot = { activeId, waiting: queue.length };
  }
  return snapshot;
}

export function useTranscriptionQueue(): QueueState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    getSnapshot,
  );
}
