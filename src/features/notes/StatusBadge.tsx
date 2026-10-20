import { m } from 'motion/react';
import type { NoteStatus } from '../../storage/db';
import { CheckCircleIcon, WarningCircleIcon } from '../../design/icons';

const LABEL: Record<NoteStatus, string> = {
  ready: 'Transcribed',
  queued: 'Waiting to transcribe',
  transcribing: 'Transcribing…',
  failed: 'Transcription failed',
};

export function StatusBadge({
  status,
  showReady = true,
}: {
  status: NoteStatus;
  showReady?: boolean;
}) {
  if (status === 'ready' && !showReady) return null;
  const base =
    'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold';
  if (status === 'ready') {
    return (
      <span className={`${base} bg-accent-soft text-accent`}>
        <CheckCircleIcon aria-hidden="true" weight="fill" className="size-3.5" />
        {LABEL.ready}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className={`${base} bg-surface-2 text-danger`}>
        <WarningCircleIcon aria-hidden="true" weight="fill" className="size-3.5" />
        {LABEL.failed}
      </span>
    );
  }
  return (
    <span className={`${base} bg-surface-2 text-fg`}>
      <m.span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-accent"
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity }}
      />
      {LABEL[status]}
    </span>
  );
}
