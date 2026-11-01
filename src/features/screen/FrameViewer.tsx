import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../design/components/useToast';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  CopyIcon,
  DownloadSimpleIcon,
  HighlighterIcon,
  PencilSimpleIcon,
  PlayIcon,
  SelectionSlashIcon,
  SquareIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
  type Icon,
} from '../../design/icons';
import { formatDuration } from '../../lib/format';
import type { Frame, Stroke } from '../../storage/db';
import { deleteFrame, restoreFrame, setFrameStrokes } from '../../storage/frames';
import { downloadBlob } from '../notes/exportNote';
import type { AudioPlayer } from '../notes/useAudioPlayer';
import type { Segment } from '../transcribe/protocol';
import { INK, TOOLS, flattenFrame, isNegligible, thin, type Tool } from './annotation';
import { StrokeLayer } from './FrameImage';
import { pairSpeech } from './timeline';

const TOOL_ICON: Record<Tool, Icon> = {
  pen: PencilSimpleIcon,
  highlighter: HighlighterIcon,
  arrow: ArrowUpRightIcon,
  box: SquareIcon,
};

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Full-screen view of one frame. Draw on it with a pen, highlighter, arrow or box; the
 * drawing is saved as you go. Shows what was said while the frame was on screen.
 */
export function FrameViewer({
  frames,
  urls,
  index,
  segments,
  player,
  onIndex,
  onClose,
}: {
  frames: Frame[];
  urls: Map<string, string>;
  index: number;
  segments: Segment[];
  player: AudioPlayer | null;
  onIndex(index: number): void;
  onClose(): void;
}) {
  const toast = useToast();
  const frame = frames[index]!;
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState<string>(INK[0].value);
  const [strokes, setStrokes] = useState<Stroke[]>(frame.strokes);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Another frame was opened: show its drawing.
  const [shownId, setShownId] = useState(frame.id);
  if (shownId !== frame.id) {
    setShownId(frame.id);
    setStrokes(frame.strokes);
    setDraft(null);
  }

  const speech = pairSpeech(frames, segments)[index]?.text ?? '';

  const save = useCallback(
    (next: Stroke[]) => {
      setStrokes(next);
      setFrameStrokes(frame.id, next).catch((error: unknown) => {
        console.error('Could not save the drawing', error);
        toast.show({ tone: 'error', message: 'Could not save the drawing.' });
      });
    },
    [frame.id, toast],
  );

  const undo = useCallback(() => {
    if (strokes.length > 0) save(strokes.slice(0, -1));
  }, [strokes, save]);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < frames.length) onIndex(next);
    },
    [index, frames.length, onIndex],
  );

  // Focus, scroll lock, and focus return.
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

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowRight') go(1);
    else if (event.key === 'ArrowLeft') go(-1);
    else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    } else if (!event.metaKey && !event.ctrlKey && !event.altKey) {
      const match = TOOLS.find((entry) => entry.key === event.key);
      if (match) setTool(match.tool);
    }
    if (event.key === 'Tab' && panelRef.current) {
      const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function pointAt(event: PointerEvent): [number, number] {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return [
      clamp((event.clientX - rect.left) / rect.width),
      clamp((event.clientY - rect.top) / rect.height),
    ];
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointAt(event);
    setDraft({ id: crypto.randomUUID(), tool, color, points: [point, point] });
  }

  function onPointerMove(event: PointerEvent) {
    if (!draft) return;
    const point = pointAt(event);
    setDraft(
      draft.tool === 'pen' || draft.tool === 'highlighter'
        ? { ...draft, points: [...draft.points, point] }
        : { ...draft, points: [draft.points[0]!, point] },
    );
  }

  function onPointerUp() {
    if (!draft) return;
    const done = { ...draft, points: thin(draft.points) };
    setDraft(null);
    if (!isNegligible(done)) save([...strokes, done]);
  }

  async function copyImage() {
    try {
      const blob = await flattenFrame({ ...frame, strokes });
      const png = blob.type === 'image/png' ? blob : await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      toast.show({
        tone: 'success',
        message: 'Image copied. Paste it anywhere.',
        durationMs: 2500,
      });
    } catch {
      toast.show({ tone: 'error', message: 'This browser could not copy the image.' });
    }
  }

  async function download() {
    const blob = await flattenFrame({ ...frame, strokes });
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    downloadBlob(`frame-${String(index + 1).padStart(2, '0')}.${ext}`, blob);
  }

  async function remove() {
    const removed = await deleteFrame(frame.id);
    if (!removed) return;
    if (frames.length <= 1) onClose();
    else if (index >= frames.length - 1) onIndex(index - 1);
    toast.show({
      message: 'Frame deleted',
      actions: [{ label: 'Undo', onClick: () => void restoreFrame(removed) }],
      durationMs: 6000,
    });
  }

  function playFromHere() {
    if (!player) return;
    player.seek(Math.max(0, frame.t - 1));
    player.play();
  }

  const shown = draft ? [...strokes, draft] : strokes;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Frame ${index + 1} of ${frames.length}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-50 flex flex-col bg-[#0b0b0c]/95 text-white outline-none backdrop-blur-sm"
    >
      <header className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
        <p className="tabular mr-auto text-sm font-medium">
          Frame {index + 1} <span className="text-white/60">of {frames.length}</span>
          <span className="text-white/60"> · {formatDuration(frame.t * 1000)}</span>
        </p>

        <div role="toolbar" aria-label="Drawing tools" className="flex items-center gap-1">
          {TOOLS.map((entry) => {
            const ToolIcon = TOOL_ICON[entry.tool];
            return (
              <ViewerButton
                key={entry.tool}
                label={`${entry.label} (${entry.key})`}
                icon={ToolIcon}
                pressed={tool === entry.tool}
                onClick={() => setTool(entry.tool)}
              />
            );
          })}
          <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
          <div role="radiogroup" aria-label="Ink colour" className="flex items-center gap-1">
            {INK.map((ink) => (
              <button
                key={ink.value}
                type="button"
                role="radio"
                aria-checked={color === ink.value}
                aria-label={ink.name}
                onClick={() => setColor(ink.value)}
                className="flex size-8 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
              >
                <span
                  className={`size-5 rounded-full border border-white/30 transition-transform ${color === ink.value ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0b0b0c]' : ''}`}
                  style={{ background: ink.value }}
                />
              </button>
            ))}
          </div>
          <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
          <ViewerButton
            label="Undo (⌘Z)"
            icon={UndoIcon}
            onClick={undo}
            disabled={strokes.length === 0}
          />
          <ViewerButton
            label="Clear drawing"
            icon={SelectionSlashIcon}
            onClick={() => save([])}
            disabled={strokes.length === 0}
          />
        </div>

        <div className="flex items-center gap-1">
          <span className="mx-1 h-6 w-px bg-white/15" aria-hidden="true" />
          {player ? (
            <ViewerButton label="Play from here" icon={PlayIcon} onClick={playFromHere} />
          ) : null}
          <ViewerButton label="Copy image" icon={CopyIcon} onClick={() => void copyImage()} />
          <ViewerButton
            label="Download image"
            icon={DownloadSimpleIcon}
            onClick={() => void download()}
          />
          <ViewerButton label="Delete frame" icon={TrashIcon} onClick={() => void remove()} />
          <ViewerButton label="Close" icon={XIcon} onClick={onClose} />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 py-2 sm:px-16">
        <ViewerButton
          label="Previous frame"
          icon={ArrowLeftIcon}
          onClick={() => go(-1)}
          disabled={index === 0}
          className="absolute left-2 sm:left-3"
        />
        <div
          ref={surfaceRef}
          data-testid="draw-surface"
          className="relative max-h-full max-w-full touch-none cursor-crosshair overflow-hidden rounded-md shadow-2xl select-none"
          style={{ aspectRatio: `${frame.width} / ${frame.height}`, height: 'min(100%, 100vw)' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <img
            src={urls.get(frame.id)}
            alt={`Screen at ${formatDuration(frame.t * 1000)}`}
            draggable={false}
            className="absolute inset-0 size-full object-contain"
          />
          <StrokeLayer frame={frame} strokes={shown} />
        </div>
        <ViewerButton
          label="Next frame"
          icon={ArrowRightIcon}
          onClick={() => go(1)}
          disabled={index === frames.length - 1}
          className="absolute right-2 sm:right-3"
        />
      </div>

      <footer className="mx-auto w-full max-w-3xl px-4 pt-1 pb-4">
        <p className="line-clamp-3 text-center text-[0.95rem] text-pretty text-white/85">
          {speech ? (
            <>
              <span className="mr-1 text-white/50">“</span>
              {speech}
              <span className="ml-1 text-white/50">”</span>
            </>
          ) : (
            <span className="text-white/50">Nothing was said while this frame was on screen.</span>
          )}
        </p>
        <p className="mt-2 hidden text-center text-xs text-white/45 sm:block">
          Drag on the frame to draw · 1–4 switch tools · ← → move between frames · Esc closes
        </p>
      </footer>
    </div>,
    document.body,
  );
}

function ViewerButton({
  label,
  icon: IconComponent,
  onClick,
  pressed,
  disabled,
  className = '',
}: {
  label: string;
  icon: Icon;
  onClick(): void;
  pressed?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`flex size-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30 aria-pressed:bg-white aria-pressed:text-black ${className}`}
    >
      <IconComponent aria-hidden="true" weight="bold" className="size-[1.1rem]" />
    </button>
  );
}

/** Clipboards accept PNG only; re-encodes a WebP or JPEG frame. */
async function toPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) throw new Error('Could not encode PNG');
  return png;
}
