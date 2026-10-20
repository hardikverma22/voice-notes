import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Layout } from './app/Layout';
import { UpdatePrompt } from './app/UpdatePrompt';
import { navigate, useHashRoute } from './app/router';
import { ToastProvider } from './design/components/Toast';
import { useToast } from './design/components/useToast';
import { NotesList } from './features/notes/NotesList';
import { titleFromTranscript } from './features/notes/title';
import { transcriptToDoc } from './features/notes/transcriptToDoc';
import { RecorderPanel } from './features/recorder/RecorderPanel';
import type { RecordingResult } from './features/recorder/useRecorder';
import { LiveTranscript } from './features/transcribe/LiveTranscript';
import { LANGUAGE, MODEL_ID } from './features/transcribe/config';
import { ModelStatus } from './features/transcribe/ModelStatus';
import { joinSegments } from './features/transcribe/merge';
import type { Segment } from './features/transcribe/protocol';
import { useLiveTranscript } from './features/transcribe/useLiveTranscript';
import { useTranscriber } from './features/transcribe/useTranscriber';
import { appendChunk, discardSession, finalizeSession, listOrphanSessions } from './storage/audio';
import { createNote, setNoteAudio } from './storage/notes';

const NotePage = lazy(() => import('./features/notes/NotePage'));

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const route = useHashRoute();
  return (
    <Layout>
      {route.name === 'note' ? (
        <Suspense fallback={<p className="text-fg-muted">Loading…</p>}>
          <NotePage key={route.id} id={route.id} />
        </Suspense>
      ) : (
        <Home />
      )}
      <UpdatePrompt />
    </Layout>
  );
}

function Home() {
  const toast = useToast();
  const transcriber = useTranscriber();
  const live = useLiveTranscript(transcriber.transcribe);
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const persistAskedRef = useRef(false);

  useRecoverOrphans();

  async function saveRecording(result: RecordingResult) {
    const sessionId = sessionRef.current;
    sessionRef.current = null;
    setRecording(false);
    live.stop();
    setFinishing(true);
    setSaveError(null);

    let text = '';
    let segments: Segment[] = [];
    let transcriptionFailed = false;
    try {
      const final = await transcriber.transcribe('final', result.pcm);
      segments = final.chunks;
      text = joinSegments(final.chunks) || final.text.trim();
    } catch {
      transcriptionFailed = true;
    }

    try {
      const createdAt = Date.now();
      const note = await createNote({
        title: titleFromTranscript(text, createdAt),
        contentJson: JSON.stringify(transcriptToDoc(text)),
        plainText: text,
        segments,
        audioId: null,
        durationMs: result.durationMs,
        language: LANGUAGE,
        modelId: MODEL_ID,
        device: transcriber.device ?? 'wasm',
      });
      if (sessionId) {
        const audio = await finalizeSession(sessionId, note.id);
        await setNoteAudio(note.id, audio.id);
      }
      if (!persistAskedRef.current) {
        persistAskedRef.current = true;
        void navigator.storage?.persist?.();
      }
      if (transcriptionFailed) {
        toast.show({ message: 'Transcription failed. The audio is saved.', durationMs: 8000 });
      }
      navigate(`/note/${note.id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setFinishing(false);
    }
  }

  return (
    <>
      <h1 className="font-serif text-2xl">Voice Notes</h1>
      <div className="mt-6">
        <ModelStatus
          status={transcriber.status}
          progress={transcriber.progress}
          device={transcriber.device}
          approxDownloadMB={transcriber.approxDownloadMB}
          errorMessage={transcriber.errorMessage}
          onDownload={transcriber.download}
        />
      </div>
      <div className="mt-8">
        <RecorderPanel
          ready={transcriber.status === 'ready'}
          busy={finishing}
          disabledReason="Download the speech model above to start recording."
          onStarted={(getPcm) => {
            sessionRef.current = crypto.randomUUID();
            setRecording(true);
            live.start(getPcm);
          }}
          onChunk={(blob, index, mimeType) => {
            const sessionId = sessionRef.current;
            if (sessionId) {
              appendChunk(sessionId, index, blob, mimeType).catch((error: unknown) => {
                console.error('Could not save an audio chunk', error);
              });
            }
          }}
          onFinished={(result) => void saveRecording(result)}
        />
      </div>
      {recording ? (
        <div className="mt-6">
          <LiveTranscript state={live.state} />
        </div>
      ) : null}
      {finishing ? <p className="mt-6 text-fg-muted">Finishing transcript…</p> : null}
      {saveError ? (
        <p role="alert" className="mt-6 text-danger">
          The note could not be saved. Your recording is kept on this device and will be offered
          again on your next visit.
        </p>
      ) : null}
      <section aria-labelledby="notes-heading" className="mt-10">
        <h2 id="notes-heading" className="mb-3 font-serif text-xl">
          Notes
        </h2>
        <NotesList />
      </section>
    </>
  );
}

/** Offers to keep or discard audio left behind by a recording that was interrupted. */
function useRecoverOrphans() {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  });

  useEffect(() => {
    let cancelled = false;

    async function offerNext(): Promise<void> {
      const sessions = await listOrphanSessions();
      if (cancelled || sessions.length === 0) return;
      const sessionId = sessions[0];
      if (!sessionId) return;
      toastRef.current.show({
        message: 'Recovered an unsaved recording',
        durationMs: 0,
        actions: [
          {
            label: 'Keep',
            onClick: () => {
              void (async () => {
                const note = await createNote({
                  title: 'Recovered recording',
                  contentJson: JSON.stringify(transcriptToDoc('')),
                  plainText: '',
                  segments: [],
                  audioId: null,
                  durationMs: 0,
                  language: LANGUAGE,
                  modelId: MODEL_ID,
                  device: 'wasm',
                });
                const audio = await finalizeSession(sessionId, note.id);
                await setNoteAudio(note.id, audio.id);
                void offerNext();
              })();
            },
          },
          {
            label: 'Discard',
            onClick: () => {
              void discardSession(sessionId).then(() => offerNext());
            },
          },
        ],
      });
    }

    void offerNext();
    return () => {
      cancelled = true;
    };
  }, []);
}
