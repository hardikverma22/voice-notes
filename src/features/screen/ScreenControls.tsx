import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef } from 'react';
import { CameraIcon, MonitorIcon, PencilSimpleIcon, XIcon } from '../../design/icons';
import { useRecording } from '../recorder/recordingContext';

/**
 * Under the record button while recording. Not sharing: a button to share a screen. Sharing:
 * a live preview of the shared screen that flashes each time a frame is kept, with a button
 * to take one now.
 */
export function ScreenControls({ disabled }: { disabled?: boolean }) {
  const rec = useRecording();
  const { status, stream, frameCount, lastFrameAt, supported } = rec.screen;
  if (!supported) return null;

  if (status !== 'on' || !stream) {
    return (
      <button
        type="button"
        onClick={rec.shareScreen}
        disabled={disabled || status === 'starting'}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-medium text-fg-muted shadow-sm transition-[background-color,color,transform] duration-(--vn-dur-fast) hover:bg-surface-2 hover:text-fg active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-45"
      >
        <MonitorIcon aria-hidden="true" className="size-4" />
        {status === 'starting' ? 'Choosing a screen…' : 'Add your screen'}
      </button>
    );
  }

  return (
    <section
      aria-label="Shared screen"
      className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-surface text-left shadow-md"
    >
      <div className="relative aspect-video bg-black">
        <LivePreview stream={stream} />
        <AnimatePresence>
          {lastFrameAt ? (
            <m.span
              key={lastFrameAt}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-white"
              initial={{ opacity: 0.55 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
            />
          ) : null}
        </AnimatePresence>
        <span className="absolute top-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-2 py-1 text-xs font-medium text-white">
          <span aria-hidden="true" className="size-2 rounded-full bg-record" />
          Live
        </span>
        <button
          type="button"
          onClick={rec.stopScreen}
          aria-label="Stop sharing screen"
          title="Stop sharing (the recording keeps going)"
          className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black focus-visible:outline-2 focus-visible:outline-white"
        >
          <XIcon aria-hidden="true" weight="bold" className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-3 p-3">
        <p className="min-w-0 flex-1 text-sm">
          <span className="tabular font-medium" aria-live="polite">
            {frameCount} {frameCount === 1 ? 'frame' : 'frames'} kept
          </span>
          <span className="mt-0.5 hidden text-xs text-fg-muted sm:block">
            Kept automatically as the screen changes.
          </span>
        </p>
        <button
          type="button"
          onClick={rec.drawNow}
          disabled={disabled}
          aria-keyshortcuts="D"
          data-tip={'Draw on the screen\nFreezes a frame to mark up while you keep talking · D'}
          data-tip-side="top"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 text-sm font-medium shadow-sm transition-transform hover:bg-surface-2 active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45"
        >
          <PencilSimpleIcon aria-hidden="true" weight="bold" className="size-4" />
          Draw
        </button>
        <button
          type="button"
          onClick={rec.snap}
          disabled={disabled}
          data-tip={'Take a frame\nKeeps what is on screen now · S'}
          data-tip-side="top"
          data-tip-align="end"
          aria-keyshortcuts="S"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg shadow-sm transition-transform active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-45"
        >
          <CameraIcon aria-hidden="true" weight="bold" className="size-4" />
          Take frame
        </button>
      </div>
    </section>
  );
}

function LivePreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      video.srcObject = null;
    };
  }, [stream]);
  return (
    <video
      ref={ref}
      muted
      playsInline
      aria-label="Live preview of the shared screen"
      className="absolute inset-0 size-full object-contain"
    />
  );
}
