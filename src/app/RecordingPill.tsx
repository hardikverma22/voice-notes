import { AnimatePresence, m } from 'motion/react';
import { PauseIcon, PlayIcon } from '../design/icons';
import { useRecording } from '../features/recorder/recordingContext';
import { formatDuration } from '../lib/format';
import { navigate } from './router';

/** Floating control shown on other pages while a recording is running. */
export function RecordingPill({ visible }: { visible: boolean }) {
  const rec = useRecording();
  const active = rec.state === 'recording' || rec.state === 'paused';
  const paused = rec.state === 'paused';
  return (
    <AnimatePresence>
      {visible && active ? (
        <m.div
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95, transition: { duration: 0.15 } }}
          className="fixed right-4 z-40 flex items-center gap-1 rounded-full border border-border bg-surface p-1.5 shadow-lg"
          style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex min-h-10 items-center gap-2 rounded-full pr-2 pl-3 text-sm font-medium hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
            aria-label={`${paused ? 'Paused' : 'Recording'} ${formatDuration(rec.elapsedMs)}. Open recorder`}
          >
            <m.span
              aria-hidden="true"
              className="size-2.5 rounded-full bg-record"
              animate={paused ? { opacity: 1 } : { opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.4, repeat: paused ? 0 : Infinity }}
            />
            <span className="tabular">{formatDuration(rec.elapsedMs)}</span>
          </button>
          <button
            type="button"
            onClick={paused ? rec.resume : rec.pause}
            aria-label={paused ? 'Resume recording' : 'Pause recording'}
            className="flex size-10 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
          >
            {paused ? (
              <PlayIcon aria-hidden="true" weight="fill" className="size-4" />
            ) : (
              <PauseIcon aria-hidden="true" weight="fill" className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={rec.stop}
            aria-label="Stop and save recording"
            className="flex size-10 items-center justify-center rounded-full bg-record text-record-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span aria-hidden="true" className="size-3.5 rounded-[0.2rem] bg-current" />
          </button>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
