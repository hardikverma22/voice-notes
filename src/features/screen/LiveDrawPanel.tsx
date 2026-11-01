import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon } from '../../design/icons';
import { formatDuration } from '../../lib/format';
import type { Frame } from '../../storage/db';
import { useRecording } from '../recorder/recordingContext';
import { displayText } from '../transcribe/merge';
import { DrawSurface, DrawToolbar } from './drawing';
import { useDrawing } from './useDrawing';

/**
 * Drawing on the screen while still recording: the frame just taken, full screen, with the
 * drawing tools. The microphone keeps going, and the live transcript shows it is listening.
 */
export default function LiveDrawPanel({ frame, onDone }: { frame: Frame; onDone(): void }) {
  const rec = useRecording();
  const drawing = useDrawing(frame);
  const panelRef = useRef<HTMLDivElement>(null);
  const url = useMemo(() => URL.createObjectURL(frame.blob), [frame.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  const { committed, tentative } = displayText(rec.live);
  const heard = [committed, tentative].filter(Boolean).join(' ').split(/\s+/).slice(-24).join(' ');
  const paused = rec.state === 'paused';

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Draw on the screen"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || (event.key === 'Enter' && !event.metaKey)) {
          event.stopPropagation();
          event.preventDefault();
          onDone();
          return;
        }
        drawing.onKey(event);
      }}
      className="vn-on-dark fixed inset-0 z-50 flex flex-col bg-[#0b0b0c]/95 text-white outline-none backdrop-blur-sm"
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:px-4">
        <p className="mr-auto flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden="true"
            className={`size-2.5 rounded-full bg-record ${paused ? '' : 'animate-pulse'}`}
          />
          {paused ? 'Paused' : 'Still recording'}
          <span className="tabular text-white/60">· {formatDuration(rec.elapsedMs)}</span>
          <span className="hidden text-white/60 sm:inline">
            · drawing on the frame from {formatDuration(frame.t * 1000)}
          </span>
        </p>
        <button
          type="button"
          onClick={onDone}
          data-tip={'Back to the recording\nEnter or Esc. Your marks are saved.'}
          data-tip-align="end"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <CheckIcon aria-hidden="true" weight="bold" className="size-4" />
          Done
        </button>
        <DrawToolbar drawing={drawing} className="w-full justify-start sm:justify-center" />
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-2 sm:px-10">
        <DrawSurface frame={frame} url={url} alt="The shared screen" drawing={drawing} />
      </div>
      <footer className="mx-auto w-full max-w-3xl px-4 pt-1 pb-4 text-center">
        <p className="line-clamp-2 min-h-[1.5em] text-[0.95rem] text-white/80" aria-live="off">
          {heard || (
            <span className="text-white/50">Keep talking. Everything you say is recorded.</span>
          )}
        </p>
        <p className="mt-2 hidden text-xs text-white/45 sm:block">
          Drag to draw · 1–4 tools · ⌘Z undo · Enter or Esc to go back to the recording
        </p>
      </footer>
    </div>,
    document.body,
  );
}
