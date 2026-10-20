import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { useToast } from '../../design/components/useToast';
import { formatDate } from '../../lib/format';
import {
  appendChunk,
  discardSession,
  finalizeSession,
  listOrphanSessions,
} from '../../storage/audio';
import { createNote, setNoteAudio } from '../../storage/notes';
import { titleFromTranscript } from '../notes/title';
import { transcriptToDoc } from '../notes/transcriptToDoc';
import { LANGUAGE, MODEL_ID } from '../transcribe/config';
import { displayText } from '../transcribe/merge';
import { getModelState, loadModel, transcribe } from '../transcribe/modelStore';
import { enqueueTranscription, resumeUnfinished } from '../transcribe/transcriptionQueue';
import { useLiveTranscript } from '../transcribe/useLiveTranscript';
import { RecordingContext, type RecordingContextValue } from './recordingContext';
import { useRecorder, type RecordingResult } from './useRecorder';

/**
 * Owns the microphone for the whole app, so a recording keeps going while the person
 * browses notes. A stopped recording is saved as a note straight away; the accurate
 * transcript is filled in by the transcription queue afterwards.
 */
export function RecordingProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const live = useLiveTranscript(transcribe);
  const liveRef = useRef(live);
  const sessionRef = useRef<string | null>(null);
  const persistAskedRef = useRef(false);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  useEffect(() => {
    liveRef.current = live;
  });

  const save = useCallback(
    async (result: RecordingResult) => {
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      const { committed, tentative } = displayText(liveRef.current.state);
      liveRef.current.stop();
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
    [toast],
  );

  const recorder = useRecorder({
    onStarted: (getPcm) => {
      sessionRef.current = crypto.randomUUID();
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
      liveRef.current.stop();
      if (sessionId) void discardSession(sessionId);
      toast.show({ message: 'Recording discarded' });
    },
  });

  useRecoverOrphans();

  const { state, elapsedMs, analyser, error, start, stop, pause, resume, cancel } = recorder;

  const value = useMemo<RecordingContextValue>(
    () => ({
      state,
      elapsedMs,
      analyser,
      errorCode: error?.code ?? null,
      live: live.state,
      lastSavedId,
      start: () => void start(),
      stop: () => void stop(),
      pause,
      resume,
      discard: () => void cancel(),
      toggle: () => {
        if (state === 'recording' || state === 'paused') void stop();
        else if (state === 'idle' || state === 'error') void start();
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
      start,
      stop,
      pause,
      resume,
      cancel,
    ],
  );

  return <RecordingContext.Provider value={value}>{children}</RecordingContext.Provider>;
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
