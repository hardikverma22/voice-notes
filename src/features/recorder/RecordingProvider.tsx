import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { useToast } from '../../design/components/useToast';
import { formatDate } from '../../lib/format';
import {
  appendChunk,
  discardSession,
  finalizeSession,
  getAudio,
  listOrphanSessions,
  replaceNoteAudio,
} from '../../storage/audio';
import type { Bookmark } from '../../storage/db';
import { createNote, getNote, setNoteAudio, startAppend } from '../../storage/notes';
import { titleFromTranscript } from '../notes/title';
import { transcriptToDoc } from '../notes/transcriptToDoc';
import { LANGUAGE, MODEL_ID, SAMPLE_RATE } from '../transcribe/config';
import { displayText } from '../transcribe/merge';
import { getModelState, loadModel, transcribe } from '../transcribe/modelStore';
import { enqueueTranscription, resumeUnfinished } from '../transcribe/transcriptionQueue';
import { useLiveTranscript } from '../transcribe/useLiveTranscript';
import { decodeToPcm16k } from './decode';
import { RecordingContext, type RecordingContextValue } from './recordingContext';
import { useRecorder, type RecordingResult } from './useRecorder';
import { concatPcm, encodeWav } from './wav';

function toBookmarks(marks: number[], offsetSec: number): Bookmark[] {
  const createdAt = Date.now();
  return marks.map((t) => ({ id: crypto.randomUUID(), t: t + offsetSec, label: '', createdAt }));
}

/**
 * Owns the microphone for the whole app, so a recording keeps going while the person
 * browses notes. A stopped recording is saved as a note straight away; the accurate
 * transcript is filled in by the transcription queue afterwards. A recording started from a
 * note (startFor) is added to the end of that note instead.
 */
export function RecordingProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const live = useLiveTranscript(transcribe);
  const liveRef = useRef(live);
  const sessionRef = useRef<string | null>(null);
  const persistAskedRef = useRef(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [targetNoteId, setTargetNoteId] = useState<string | null>(null);
  const targetRef = useRef<string | null>(null);
  const pendingTargetRef = useRef<string | null>(null);
  const marksRef = useRef<number[]>([]);
  const [markCount, setMarkCount] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    liveRef.current = live;
  });

  /** Merges the new audio onto the note's audio. False means it could not, so save it as new. */
  const appendTo = useCallback(
    async (
      noteId: string,
      sessionId: string | null,
      result: RecordingResult,
      marks: number[],
    ): Promise<boolean> => {
      try {
        const note = await getNote(noteId);
        if (!note) return false;
        const previousAudio = note.audioId ? await getAudio(note.audioId) : undefined;
        const previous = previousAudio
          ? await decodeToPcm16k(previousAudio.blob)
          : new Float32Array(0);
        const offsetSec = previous.length / SAMPLE_RATE;
        const merged = concatPcm([previous, result.pcm]);
        const record = await replaceNoteAudio(noteId, encodeWav(merged, SAMPLE_RATE));
        await startAppend(noteId, {
          audioId: record.id,
          durationMs: Math.round((merged.length / SAMPLE_RATE) * 1000),
          offsetSec,
          bookmarks: toBookmarks(marks, offsetSec),
        });
        if (sessionId) await discardSession(sessionId);
        enqueueTranscription(noteId, result.pcm);
        toast.show({ tone: 'success', message: 'Added to this note', durationMs: 3000 });
        return true;
      } catch (error) {
        console.error('Could not add the recording to the note', error);
        toast.show({
          tone: 'error',
          message: 'Could not add it to that note, so it was saved as a new note.',
        });
        return false;
      }
    },
    [toast],
  );

  const save = useCallback(
    async (result: RecordingResult) => {
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      const target = targetRef.current;
      targetRef.current = null;
      setTargetNoteId(null);
      const marks = marksRef.current;
      marksRef.current = [];
      setMarkCount(0);
      const { committed, tentative } = displayText(liveRef.current.state);
      liveRef.current.stop();
      if (target && (await appendTo(target, sessionId, result, marks))) return;
      const draft = [committed, tentative].filter(Boolean).join(' ');
      const createdAt = Date.now();
      try {
        const note = await createNote({
          title: draft
            ? titleFromTranscript(draft, createdAt)
            : `Recording, ${formatDate(createdAt)}`,
          autoTitle: true,
          contentJson: JSON.stringify(transcriptToDoc(draft)),
          plainText: draft,
          segments: [],
          audioId: null,
          durationMs: result.durationMs,
          language: LANGUAGE,
          modelId: MODEL_ID,
          device: getModelState().device ?? 'wasm',
          status: 'queued',
          bookmarks: toBookmarks(marks, 0),
        });
        if (sessionId) {
          const audio = await finalizeSession(sessionId, note.id);
          await setNoteAudio(note.id, audio.id);
        }
        enqueueTranscription(note.id, result.pcm);
        setLastSavedId(note.id);
        if (!persistAskedRef.current) {
          persistAskedRef.current = true;
          void navigator.storage?.persist?.();
        }
        toast.show({
          tone: 'success',
          message: 'Saved to your notes',
          actions: [{ label: 'Open', onClick: () => navigate(`/note/${note.id}`) }],
        });
      } catch (error) {
        console.error('Could not save the recording', error);
        toast.show({
          tone: 'error',
          durationMs: 0,
          message:
            'The note could not be saved. The audio is kept on this device and will be recovered on your next visit.',
        });
      }
    },
    [toast, appendTo],
  );

  const recorder = useRecorder({
    onStarted: (getPcm) => {
      sessionRef.current = crypto.randomUUID();
      targetRef.current = pendingTargetRef.current;
      pendingTargetRef.current = null;
      setTargetNoteId(targetRef.current);
      marksRef.current = [];
      setMarkCount(0);
      setLastSavedId(null);
      // The speech model downloads on first use; live text appears once it is ready.
      loadModel();
      liveRef.current.start(getPcm);
    },
    onChunk: (blob, index, mimeType) => {
      const sessionId = sessionRef.current;
      if (sessionId) {
        appendChunk(sessionId, index, blob, mimeType).catch((error: unknown) => {
          console.error('Could not save an audio chunk', error);
        });
      }
    },
    onFinished: (result) => void save(result),
    onCancelled: () => {
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      targetRef.current = null;
      setTargetNoteId(null);
      marksRef.current = [];
      setMarkCount(0);
      liveRef.current.stop();
      if (sessionId) void discardSession(sessionId);
      toast.show({ message: 'Recording discarded' });
    },
  });

  useRecoverOrphans();
  useMarkShortcut(recorder.state === 'recording' || recorder.state === 'paused', () => {
    marksRef.current.push(elapsedRef.current / 1000);
    setMarkCount(marksRef.current.length);
  });

  const { state, elapsedMs, analyser, error, start, stop, pause, resume, cancel } = recorder;
  useEffect(() => {
    elapsedRef.current = elapsedMs;
  });

  const value = useMemo<RecordingContextValue>(
    () => ({
      state,
      elapsedMs,
      analyser,
      errorCode: error?.code ?? null,
      live: live.state,
      lastSavedId,
      targetNoteId,
      markCount,
      start: () => {
        pendingTargetRef.current = null;
        void start();
      },
      startFor: (noteId) => {
        if (state !== 'idle' && state !== 'error') return;
        pendingTargetRef.current = noteId;
        void start();
      },
      mark: () => {
        if (state !== 'recording' && state !== 'paused') return;
        marksRef.current.push(elapsedRef.current / 1000);
        setMarkCount(marksRef.current.length);
      },
      stop: () => void stop(),
      pause,
      resume,
      discard: () => void cancel(),
      toggle: () => {
        if (state === 'recording' || state === 'paused') void stop();
        else if (state === 'idle' || state === 'error') {
          pendingTargetRef.current = null;
          void start();
        }
      },
      dismissSaved: () => setLastSavedId(null),
    }),
    [
      state,
      elapsedMs,
      analyser,
      error,
      live.state,
      lastSavedId,
      targetNoteId,
      markCount,
      start,
      stop,
      pause,
      resume,
      cancel,
    ],
  );

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
}

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable], [role="textbox"]';

/** M marks the current moment while recording, unless the person is typing. */
function useMarkShortcut(enabled: boolean, onMark: () => void) {
  const callbackRef = useRef(onMark);
  useEffect(() => {
    callbackRef.current = onMark;
  });
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.code !== 'KeyM' || event.repeat || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as Element | null;
      if (target?.closest?.(TYPING_SELECTOR)) return;
      event.preventDefault();
      callbackRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}

/**
 * Audio chunks left behind by an interrupted recording (tab closed, crash) are turned
 * into a note and transcribed, so nothing said is lost. Also resumes unfinished transcripts.
 */
function useRecoverOrphans() {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await resumeUnfinished();
      const sessions = await listOrphanSessions();
      let recoveredId: string | null = null;
      for (const sessionId of sessions) {
        if (cancelled) return;
        const createdAt = Date.now();
        const note = await createNote({
          title: `Recovered recording, ${formatDate(createdAt)}`,
          autoTitle: true,
          contentJson: JSON.stringify(transcriptToDoc('')),
          plainText: '',
          segments: [],
          audioId: null,
          durationMs: 0,
          language: LANGUAGE,
          modelId: MODEL_ID,
          device: 'wasm',
          status: 'queued',
        });
        const audio = await finalizeSession(sessionId, note.id);
        await setNoteAudio(note.id, audio.id);
        enqueueTranscription(note.id);
        recoveredId = note.id;
      }
      if (recoveredId && !cancelled) {
        const id = recoveredId;
        toastRef.current.show({
          tone: 'success',
          durationMs: 8000,
          message:
            sessions.length === 1
              ? 'Recovered an unsaved recording'
              : `Recovered ${sessions.length} unsaved recordings`,
          actions: [{ label: 'Open', onClick: () => navigate(`/note/${id}`) }],
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
