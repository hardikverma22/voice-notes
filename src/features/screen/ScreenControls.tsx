import { AnimatePresence, m } from 'motion/react';
import { Kbd } from '../../design/components/Kbd';
import { CameraIcon, MonitorIcon, XIcon } from '../../design/icons';
import { useRecording } from '../recorder/recordingContext';

/** Shown under the record button while recording: share a screen, or take frames of it. */
export function ScreenControls({ disabled }: { disabled?: boolean }) {
  const rec = useRecording();
  const { status, frameCount, lastFrameAt, supported } = rec.screen;
  if (!supported) return null;

  if (status !== 'on') {
    return (
      <button
        type="button"
        onClick={rec.shareScreen}
        disabled={disabled || status === 'starting'}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-medium text-fg-muted shadow-sm transition-[background-color,color,transform] duration-(--vn-dur-fast) hover:bg-surface-2 hover:text-fg active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45"
      >
        <MonitorIcon aria-hidden="true" className="size-4" />
        {status === 'starting' ? 'Choosing a screen…' : 'Share screen'}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1 shadow-sm">
        <span className="flex items-center gap-2 pr-1 pl-3 text-sm font-medium">
          <span className="relative flex size-2.5">
            <AnimatePresence>
              {lastFrameAt ? (
                <m.span
                  key={lastFrameAt}
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full bg-accent"
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 0.7 }}
                />
              ) : null}
            </AnimatePresence>
            <span aria-hidden="true" className="relative size-2.5 rounded-full bg-accent" />
          </span>
          <span>Sharing screen</span>
          <span className="tabular text-fg-muted" aria-live="polite">
            · {frameCount} {frameCount === 1 ? 'frame' : 'frames'}
          </span>
        </span>
        <button
          type="button"
          onClick={rec.snap}
          disabled={disabled}
          aria-keyshortcuts="S"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-sm font-medium text-accent transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45"
        >
          <CameraIcon aria-hidden="true" weight="bold" className="size-4" />
          Take frame
        </button>
        <button
          type="button"
          onClick={rec.stopScreen}
          aria-label="Stop sharing screen"
          className="flex size-9 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      </div>
      <p className="hidden items-center gap-1.5 text-xs text-fg-muted sm:flex">
        Frames are kept when the screen changes · <Kbd>S</Kbd> takes one now
      </p>
    </div>
  );
}
