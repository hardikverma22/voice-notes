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
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  TextTIcon,
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
import { frameDuring, pairSpeech, playFrom, segmentAt } from './timeline';

const TOOL_ICON: Record<Tool, Icon> = {
  pen: PencilSimpleIcon,
  highlighter: HighlighterIcon,
  arrow: ArrowUpRightIcon,
  box: SquareIcon,
};

const TOOL_HINT: Record<Tool, string> = {
  pen: 'Draw freehand',
  highlighter: 'Highlight text or an area',
  arrow: 'Point at something',
  box: 'Frame an area',
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
  const [showText, setShowText] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  // Another frame was opened: show its drawing.
  const [shownId, setShownId] = useState(frame.id);
  if (shownId !== frame.id) {
    setShownId(frame.id);
    setStrokes(frame.strokes);
    setDraft(null);
  }

  const spoken = pairSpeech(frames, segments)[index]?.segments ?? [];
  const playing = player?.playing ?? false;
  const now = player?.currentTime ?? 0;
  const speaking = playing ? segmentAt(spoken, now) : -1;

  // Replay: while the audio plays, show the frame that was on screen at that moment.
  const following = playing ? frameDuring(frames, now) : -1;
  useEffect(() => {
    if (following >= 0 && following !== index && !draft) onIndex(following);
  }, [following, index, draft, onIndex]);

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
      if (next < 0 || next >= frames.length) return;
      // While replaying, jump the audio too, or playback would pull the old frame back.
      if (player?.playing) player.seek(playFrom(frames[next]!));
      onIndex(next);
    },
    [index, frames, onIndex, player],
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
    } else if (event.key === ' ' && player && !(event.target as Element).closest('button')) {
      event.preventDefault();
      togglePlay();
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

  /** Plays from this frame (or resumes inside it); frames then follow the audio. */
  function togglePlay() {
    if (!player) return;
    if (player.playing) {
      player.toggle();
      return;
    }
    if (frameDuring(frames, player.currentTime) !== index) player.seek(playFrom(frame));
    player.play();
  }

  function seekToFrame(target: number) {
    if (player) player.seek(playFrom(frames[target]!));
    onIndex(target);
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
      className="vn-on-dark fixed inset-0 z-50 flex flex-col bg-[#0b0b0c]/95 text-white outline-none backdrop-blur-sm"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:px-4">
        <p className="tabular mr-auto text-sm font-medium">
          Frame {index + 1} <span className="text-white/60">of {frames.length}</span>
          <span className="text-white/60"> · {formatDuration(frame.t * 1000)}</span>
        </p>

        <div className="flex items-center gap-0.5 sm:gap-1">
          <ViewerButton
            label="Text on screen"
            hint="The text read from this frame, to copy or check"
            icon={TextTIcon}
            pressed={showText}
            onClick={() => setShowText((value) => !value)}
          />
          <ViewerButton
            label="Copy image"
            hint="With your marks, ready to paste into ChatGPT, Claude, Slack or an issue"
            icon={CopyIcon}
            onClick={() => void copyImage()}
          />
          <ViewerButton
            label="Download image"
            hint="Saves this frame with your marks"
            icon={DownloadSimpleIcon}
            onClick={() => void download()}
          />
          <ViewerButton
            label="Delete frame"
            hint="You can undo this"
            icon={TrashIcon}
            onClick={() => void remove()}
            tipAlign="end"
          />
          <ViewerButton label="Close" hint="Esc" icon={XIcon} onClick={onClose} tipAlign="end" />
        </div>
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="flex w-full items-center justify-start gap-1 overflow-x-auto sm:justify-center sm:overflow-visible"
        >
          {TOOLS.map((entry) => {
            const ToolIcon = TOOL_ICON[entry.tool];
            return (
              <ViewerButton
                key={entry.tool}
                label={`${entry.label} (${entry.key})`}
                hint={TOOL_HINT[entry.tool]}
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
                data-tip={ink.name}
                onClick={() => setColor(ink.value)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
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
            label="Undo"
            hint="⌘Z / Ctrl+Z"
            icon={UndoIcon}
            onClick={undo}
            disabled={strokes.length === 0}
          />
          <ViewerButton
            label="Clear drawing"
            hint="Removes every mark on this frame"
            icon={SelectionSlashIcon}
            onClick={() => save([])}
            disabled={strokes.length === 0}
          />
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-12 py-2 sm:px-16">
        <ViewerButton
          label="Previous frame"
          hint="←"
          tipAlign="start"
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
        {showText ? <ScreenTextPanel text={frame.text} onClose={() => setShowText(false)} /> : null}
        <ViewerButton
          label="Next frame"
          hint="→"
          tipAlign="end"
          icon={ArrowRightIcon}
          onClick={() => go(1)}
          disabled={index === frames.length - 1}
          className="absolute right-2 sm:right-3"
        />
      </div>

      <footer className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-1 pb-4">
        <p
          className="line-clamp-3 min-h-[1.5em] text-center text-[0.95rem] text-pretty"
          aria-live={playing ? 'off' : 'polite'}
        >
          {spoken.length > 0 ? (
            spoken.map((segment, i) => (
              <span
                key={`${segment.start}:${i}`}
                className={`transition-colors duration-200 ${speaking === -1 ? 'text-white/85' : i === speaking ? 'text-white' : 'text-white/40'}`}
              >
                {i > 0 ? ' ' : ''}
                {segment.text.trim()}
              </span>
            ))
          ) : (
            <span className="text-white/50">Nothing was said while this frame was on screen.</span>
          )}
        </p>
        {player ? (
          <ReplayBar
            frames={frames}
            index={index}
            player={player}
            onPlay={togglePlay}
            onFrame={seekToFrame}
          />
        ) : null}
        <p className="hidden text-center text-xs text-white/45 sm:block">
          Drag on the frame to draw · 1–4 tools · ← → frames
          {player ? ' · Space plays, and frames follow your voice' : ''} · Esc closes
        </p>
      </footer>
    </div>,
    document.body,
  );
}

function ViewerButton({
  label,
  hint,
  icon: IconComponent,
  onClick,
  pressed,
  disabled,
  tipAlign,
  tipSide,
  className = '',
}: {
  label: string;
  /** Second tooltip line: what it does, or its shortcut. */
  hint?: string;
  tipAlign?: 'start' | 'end';
  tipSide?: 'top';
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
      data-tip={hint ? `${label}\n${hint}` : label}
      data-tip-align={tipAlign}
      data-tip-side={tipSide}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white disabled:opacity-30 aria-pressed:bg-white aria-pressed:text-black ${className}`}
    >
      <IconComponent aria-hidden="true" weight="bold" className="size-[1.1rem]" />
    </button>
  );
}

/** The text read from the frame, over the right side of the viewer, with a copy button. */
function ScreenTextPanel({ text, onClose }: { text: string | undefined; onClose(): void }) {
  const toast = useToast();
  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ tone: 'success', message: 'Text copied', durationMs: 2000 });
    } catch {
      toast.show({ tone: 'error', message: 'Could not copy. Select the text instead.' });
    }
  }
  return (
    <aside
      aria-label="Text on screen"
      className="absolute inset-y-2 right-14 z-10 flex w-[min(22rem,calc(100%-7rem))] flex-col rounded-lg border border-white/15 bg-[#151517]/95 shadow-2xl backdrop-blur sm:right-16"
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <p className="mr-auto text-sm font-medium">Text on screen</p>
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!text}
          className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-black disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <CopyIcon aria-hidden="true" weight="bold" className="size-3.5" />
          Copy text
        </button>
        <ViewerButton label="Close text" icon={XIcon} onClick={onClose} tipAlign="end" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {text === undefined ? (
          <p className="text-sm text-white/60">
            Reading the text on this frame… It runs on your device in the background.
          </p>
        ) : text ? (
          <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-white/90 select-text">
            {text}
          </pre>
        ) : (
          <p className="text-sm text-white/60">No text found on this frame.</p>
        )}
      </div>
      <p className="border-t border-white/10 px-3 py-2 text-[0.7rem] text-white/45">
        Read on this device by OCR. It may have small mistakes. Included in Export for agent.
      </p>
    </aside>
  );
}

/**
 * Play / pause and a scrubber for the recording, with a tick for each frame. The current
 * frame's tick is bright; click a tick to jump to that frame.
 */
function ReplayBar({
  frames,
  index,
  player,
  onPlay,
  onFrame,
}: {
  frames: Frame[];
  index: number;
  player: AudioPlayer;
  onPlay(): void;
  onFrame(index: number): void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(player.duration, frames[frames.length - 1]?.t ?? 0, 0.001);
  const at = (t: number) => `${Math.min(100, Math.max(0, (t / duration) * 100))}%`;

  function seekFromPointer(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    player.seek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration);
  }

  return (
    <div className="flex items-center gap-3" data-testid="replay-bar">
      <button
        type="button"
        onClick={onPlay}
        aria-label={player.playing ? 'Pause' : 'Play from this frame'}
        data-tip={
          player.playing ? 'Pause\nSpace' : 'Play from this frame\nFrames follow along · Space'
        }
        data-tip-side="top"
        data-tip-align="start"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {player.playing ? (
          <PauseIcon aria-hidden="true" weight="fill" className="size-5" />
        ) : (
          <PlayIcon aria-hidden="true" weight="fill" className="ml-0.5 size-5" />
        )}
      </button>
      <span className="tabular w-10 shrink-0 text-right text-xs text-white/70">
        {formatDuration(player.currentTime * 1000)}
      </span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Playback position"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(player.currentTime)}
        aria-valuetext={`${formatDuration(player.currentTime * 1000)} of ${formatDuration(duration * 1000)}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          seekFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.buttons === 1) seekFromPointer(event.clientX);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          player.skip(event.key === 'ArrowLeft' ? -5 : 5);
        }}
        className="group relative flex h-8 min-w-0 flex-1 cursor-pointer items-center focus-visible:outline-2 focus-visible:outline-white"
      >
        <span className="absolute inset-x-0 h-1 rounded-full bg-white/20" />
        <span
          className="absolute left-0 h-1 rounded-full bg-white"
          style={{ width: at(player.currentTime) }}
        />
        {frames.map((frame, i) => (
          <span
            key={frame.id}
            aria-hidden="true"
            onPointerDown={(event) => {
              // A tick jumps to its frame; ← → are the keyboard path.
              event.stopPropagation();
              onFrame(i);
            }}
            data-tip={`Frame ${i + 1} · ${formatDuration(frame.t * 1000)}`}
            data-tip-side="top"
            className="absolute flex h-8 w-3 -translate-x-1/2 items-center justify-center"
            style={{ left: at(frame.t) }}
          >
            <span
              className={`h-3.5 w-1 rounded-full transition-colors ${i === index ? 'bg-white' : 'bg-white/45'}`}
            />
          </span>
        ))}
      </div>
      <span className="tabular w-10 shrink-0 text-xs text-white/70">
        {formatDuration(duration * 1000)}
      </span>
    </div>
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
