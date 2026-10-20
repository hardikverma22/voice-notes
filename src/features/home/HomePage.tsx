import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, m } from 'motion/react';
import { Button, IconButton } from '../../design/components/Button';
import { Kbd } from '../../design/components/Kbd';
import {
  ArrowRightIcon,
  CheckIcon,
  LockSimpleIcon,
  PauseIcon,
  PlayIcon,
  TrashIcon,
  XIcon,
} from '../../design/icons';
import { formatDuration } from '../../lib/format';
import { getNote } from '../../storage/notes';
import { NotesLibrary } from '../notes/NotesLibrary';
import { StatusBadge } from '../notes/StatusBadge';
import { RecordButton } from '../recorder/RecordButton';
import { useRecording } from '../recorder/recordingContext';
import type { RecorderErrorCode } from '../recorder/recorder';
import { useAudioLevel } from '../recorder/useAudioLevel';
import { useSpaceToggle } from '../recorder/useSpaceToggle';
import { Waveform } from '../recorder/Waveform';
import { MAX_RECORDING_SEC } from '../transcribe/config';
import { LiveTranscript } from '../transcribe/LiveTranscript';
import { ModelProgressCard } from '../transcribe/ModelIndicator';
import { useModel } from '../transcribe/modelStore';

const ERROR_TEXT: Record<RecorderErrorCode, string> = {
  'permission-denied':
    "Microphone access is blocked. Allow it in your browser's site settings, then try again.",
  'no-microphone': 'No microphone found. Connect one and try again.',
  'mic-busy': 'Your microphone is in use by another app.',
  'insecure-context': 'Recording needs a secure connection (https or localhost).',
  unknown: 'Something went wrong while starting the microphone.',
};

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Up late?';
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}

export default function HomePage() {
  const rec = useRecording();
  const model = useModel();
  const active = rec.state === 'recording' || rec.state === 'paused' || rec.state === 'stopping';
  const paused = rec.state === 'paused';
  const level = useAudioLevel(rec.analyser, rec.state === 'recording');

  useSpaceToggle(rec.toggle, rec.state !== 'requesting' && rec.state !== 'stopping');

  const today = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="relative">
      <Ambient recording={active && !paused} />

      <section
        aria-labelledby="home-heading"
        className="relative mx-auto flex max-w-2xl flex-col items-center px-4 pt-8 pb-10 text-center sm:pt-14"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {active ? (
            <m.div
              key="rec-head"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              className="flex flex-col items-center"
            >
              <p className="flex items-center gap-2 text-sm font-medium text-record">
                <m.span
                  aria-hidden="true"
                  className="size-2 rounded-full bg-record"
                  animate={paused ? { opacity: 1 } : { opacity: [1, 0.25, 1] }}
                  transition={{ duration: 1.4, repeat: paused ? 0 : Infinity }}
                />
                {paused ? 'Paused' : rec.state === 'stopping' ? 'Saving…' : 'Recording'}
              </p>
              <h1 id="home-heading" className="sr-only">
                Recording
              </h1>
              <p
                className="tabular mt-2 font-serif text-6xl font-medium tracking-tight sm:text-7xl"
                aria-label={`Elapsed ${formatDuration(rec.elapsedMs)}`}
              >
                {formatDuration(rec.elapsedMs)}
              </p>
              <p className="tabular mt-1 text-xs text-fg-muted">
                of {formatDuration(MAX_RECORDING_SEC * 1000)} max
              </p>
            </m.div>
          ) : (
            <m.div
              key="idle-head"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
              className="flex flex-col items-center"
            >
              <p className="text-sm font-medium text-fg-muted">{today}</p>
              <h1
                id="home-heading"
                className="mt-2 font-serif text-4xl font-medium tracking-tight text-balance sm:text-5xl"
              >
                {greeting()} <span className="text-fg-muted italic">What&apos;s on your mind?</span>
              </h1>
              <p className="mt-3 max-w-md text-[0.95rem] text-fg-muted text-pretty">
                Tap the mic and think out loud. It&apos;s transcribed right here on your device —
                nothing is uploaded.
              </p>
            </m.div>
          )}
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-center gap-6">
          <SideControl visible={active}>
            <IconButton
              icon={TrashIcon}
              label="Discard recording"
              onClick={rec.discard}
              disabled={rec.state === 'stopping'}
              className="border border-border bg-surface shadow-sm"
            />
          </SideControl>
          <RecordButton
            recording={active}
            paused={paused}
            level={level}
            onToggle={rec.toggle}
            disabled={rec.state === 'requesting' || rec.state === 'stopping'}
          />
          <SideControl visible={active}>
            <IconButton
              icon={paused ? PlayIcon : PauseIcon}
              label={paused ? 'Resume recording' : 'Pause recording'}
              onClick={paused ? rec.resume : rec.pause}
              disabled={rec.state === 'stopping'}
              className="border border-border bg-surface shadow-sm"
            />
          </SideControl>
        </div>

        <p className="mt-1 min-h-5 text-sm text-fg-muted" aria-live="polite">
          {rec.state === 'requesting'
            ? 'Starting microphone…'
            : active
              ? paused
                ? 'Tap the button to save, or resume'
                : 'Tap to stop and save'
              : 'Tap to record'}
        </p>

        {rec.errorCode ? (
          <p role="alert" className="mt-3 max-w-sm text-sm text-danger">
            {ERROR_TEXT[rec.errorCode]}
          </p>
        ) : null}

        <AnimatePresence initial={false}>
          {active ? (
            <m.div
              key="live"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
              className="mt-6 flex w-full flex-col gap-4"
            >
              <Waveform analyser={rec.analyser} paused={paused} tone="--vn-record" />
              <ModelProgressCard context="recording" />
              <LiveTranscript state={rec.live} paused={paused} />
            </m.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {!active && rec.lastSavedId ? (
            <SavedCard key={rec.lastSavedId} id={rec.lastSavedId} onDismiss={rec.dismissSaved} />
          ) : null}
        </AnimatePresence>

        {!active ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-xs text-fg-muted">
            {model.status === 'idle' ? (
              <p className="max-w-sm text-pretty">
                The first recording downloads a one-time speech model (about{' '}
                {model.approxDownloadMB} MB). After that, everything works offline.
              </p>
            ) : null}
            <p className="hidden items-center gap-4 sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>Space</Kbd> record / stop
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd> search notes
              </span>
            </p>
            <p className="inline-flex items-center gap-1.5">
              <LockSimpleIcon aria-hidden="true" className="size-3.5" />
              Private by design — audio and text stay on this device
            </p>
          </div>
        ) : null}
      </section>

      <section aria-label="Your notes" className="relative mx-auto max-w-2xl px-4 pb-16 lg:hidden">
        <NotesLibrary variant="page" />
      </section>
    </div>
  );
}

function SideControl({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div className="flex size-11 items-center justify-center">
      <AnimatePresence>
        {visible ? (
          <m.div
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.12 } }}
          >
            {children}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Soft colour field behind the hero; shifts to the record colour while recording. */
function Ambient({ recording }: { recording: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] overflow-hidden"
    >
      <m.div
        className="absolute left-1/2 top-[-12rem] size-[38rem] -translate-x-1/2 rounded-full bg-accent blur-3xl"
        initial={false}
        animate={{ opacity: recording ? 0 : 0.1 }}
        transition={{ duration: 0.8 }}
      />
      <m.div
        className="absolute left-1/2 top-[-12rem] size-[38rem] -translate-x-1/2 rounded-full bg-record blur-3xl"
        initial={false}
        animate={{ opacity: recording ? 0.13 : 0, scale: recording ? 1.08 : 0.9 }}
        transition={{ duration: 0.8 }}
      />
    </div>
  );
}

function SavedCard({ id, onDismiss }: { id: string; onDismiss: () => void }) {
  const note = useLiveQuery(() => getNote(id), [id]);
  return (
    <m.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
      className="mt-8 w-full max-w-md rounded-lg border border-border bg-surface p-4 text-left shadow-md"
      role="status"
    >
      <div className="flex items-start gap-3">
        <m.span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-surface"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.05 }}
        >
          <CheckIcon aria-hidden="true" weight="bold" className="size-5" />
        </m.span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Saved to your notes</p>
          <p className="mt-0.5 truncate text-sm text-fg-muted">{note?.title ?? '…'}</p>
          {note ? (
            <div className="mt-2">
              <StatusBadge status={note.status} />
            </div>
          ) : null}
        </div>
        <IconButton icon={XIcon} label="Dismiss" size="sm" onClick={onDismiss} />
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          variant="soft"
          icon={ArrowRightIcon}
          onClick={() => (window.location.hash = `/note/${id}`)}
        >
          Open note
        </Button>
      </div>
    </m.div>
  );
}
