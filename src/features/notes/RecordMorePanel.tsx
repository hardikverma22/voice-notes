import { AnimatePresence, m } from 'motion/react';
import { IconButton } from '../../design/components/Button';
import { BookmarkSimpleIcon, PauseIcon, PlayIcon, TrashIcon } from '../../design/icons';
import { formatDuration } from '../../lib/format';
import { useRecording } from '../recorder/recordingContext';
import { Waveform } from '../recorder/Waveform';
import { MAX_RECORDING_SEC } from '../transcribe/config';

/**
 * Shown on a note while a recording is being added to it. Stopping appends the audio and,
 * once transcribed, the text to the end of the note.
 */
export function RecordMorePanel() {
  const rec = useRecording();
  const paused = rec.state === 'paused';
  const stopping = rec.state === 'stopping';
  const time = formatDuration(rec.elapsedMs);

  return (
    <m.section
      aria-label="Recording more for this note"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6, transition: { duration: 0.15 } }}
      className="overflow-hidden rounded-lg border border-border bg-surface shadow-md"
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <p className="flex items-center gap-2 text-sm font-medium text-record">
          <m.span
            aria-hidden="true"
            className="size-2 rounded-full bg-record"
            animate={paused || stopping ? { opacity: 1 } : { opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.4, repeat: paused || stopping ? 0 : Infinity }}
          />
          {stopping ? 'Adding to this note…' : paused ? 'Paused' : 'Recording more'}
        </p>
        <p
          className="tabular font-serif text-2xl font-medium tracking-tight"
          aria-label={`Elapsed ${time}`}
        >
          {time}
          <span className="sr-only"> of {formatDuration(MAX_RECORDING_SEC * 1000)} max</span>
        </p>
      </div>

      <div className="px-4 pt-2">
        <Waveform analyser={rec.analyser} paused={paused} tone="--vn-record" />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border bg-bg/40 px-2 py-2">
        <div className="flex items-center gap-1">
          <IconButton
            icon={TrashIcon}
            label="Discard this recording"
            size="sm"
            onClick={rec.discard}
            disabled={stopping}
          />
          <IconButton
            icon={paused ? PlayIcon : PauseIcon}
            label={paused ? 'Resume recording' : 'Pause recording'}
            size="sm"
            onClick={paused ? rec.resume : rec.pause}
            disabled={stopping}
          />
          <MarkButton count={rec.markCount} onMark={rec.mark} disabled={stopping} />
        </div>
        <button
          type="button"
          onClick={rec.stop}
          disabled={stopping}
          className="inline-flex min-h-9 items-center gap-2 rounded-full bg-record px-4 text-sm font-semibold text-record-fg shadow-sm transition-[filter,transform] duration-(--vn-dur-fast) hover:brightness-110 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45"
        >
          <span aria-hidden="true" className="size-2.5 rounded-[0.15rem] bg-current" />
          Stop and add
        </button>
      </div>
    </m.section>
  );
}

/** Marks the current moment; the count ticks up so the tap is confirmed without looking. */
export function MarkButton({
  count,
  onMark,
  disabled,
  variant = 'compact',
}: {
  count: number;
  onMark: () => void;
  disabled?: boolean;
  variant?: 'compact' | 'roomy';
}) {
  const roomy = variant === 'roomy';
  return (
    <button
      type="button"
      onClick={onMark}
      disabled={disabled}
      aria-keyshortcuts="M"
      className={`inline-flex items-center gap-1.5 rounded-full font-medium text-fg-muted transition-[background-color,color,transform] duration-(--vn-dur-fast) hover:bg-surface-2 hover:text-fg active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45 ${roomy ? 'min-h-11 border border-border bg-surface px-4 text-sm shadow-sm' : 'min-h-9 px-3 text-xs'}`}
    >
      <BookmarkSimpleIcon
        aria-hidden="true"
        weight={count > 0 ? 'fill' : 'regular'}
        className={`size-4 ${count > 0 ? 'text-accent' : ''}`}
      />
      Mark moment
      <AnimatePresence initial={false} mode="popLayout">
        {count > 0 ? (
          <m.span
            key={count}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6, transition: { duration: 0.1 } }}
            className="tabular inline-flex min-w-5 justify-center rounded-full bg-accent-soft px-1.5 text-[0.7rem] font-semibold text-accent"
          >
            {count}
          </m.span>
        ) : null}
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {count > 0 ? `${count} ${count === 1 ? 'moment' : 'moments'} marked` : ''}
      </span>
    </button>
  );
}
