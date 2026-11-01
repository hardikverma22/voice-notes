import {
  ArrowUpRightIcon,
  HighlighterIcon,
  PencilSimpleIcon,
  SelectionSlashIcon,
  SquareIcon,
  UndoIcon,
  type Icon,
} from '../../design/icons';
import type { Frame } from '../../storage/db';
import { INK, TOOLS, type Tool } from './annotation';
import { StrokeLayer } from './FrameImage';
import type { Drawing } from './useDrawing';

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

/** The frame with its drawing, taking pointer input to draw. Fits the space it is given. */
export function DrawSurface({
  frame,
  url,
  alt,
  drawing,
}: {
  frame: Frame;
  url: string | undefined;
  alt: string;
  drawing: Drawing;
}) {
  return (
    <div
      data-testid="draw-surface"
      className="relative max-h-full max-w-full touch-none cursor-crosshair overflow-hidden rounded-md shadow-2xl select-none"
      style={{ aspectRatio: `${frame.width} / ${frame.height}`, height: 'min(100%, 100vw)' }}
      {...drawing.surfaceHandlers}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          draggable={false}
          className="absolute inset-0 size-full object-contain"
        />
      ) : null}
      <StrokeLayer frame={frame} strokes={drawing.shown} />
    </div>
  );
}

/** Tools, ink colours, undo and clear. Styled for a dark backdrop. */
export function DrawToolbar({ drawing, className = '' }: { drawing: Drawing; className?: string }) {
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className={`flex items-center gap-1 overflow-x-auto sm:overflow-visible ${className}`}
    >
      {TOOLS.map((entry) => (
        <ViewerButton
          key={entry.tool}
          label={`${entry.label} (${entry.key})`}
          hint={TOOL_HINT[entry.tool]}
          icon={TOOL_ICON[entry.tool]}
          pressed={drawing.tool === entry.tool}
          onClick={() => drawing.setTool(entry.tool)}
        />
      ))}
      <span className="mx-1 h-6 w-px shrink-0 bg-white/15" aria-hidden="true" />
      <div role="radiogroup" aria-label="Ink colour" className="flex items-center gap-1">
        {INK.map((ink) => (
          <button
            key={ink.value}
            type="button"
            role="radio"
            aria-checked={drawing.color === ink.value}
            aria-label={ink.name}
            data-tip={ink.name}
            onClick={() => drawing.setColor(ink.value)}
            className="flex size-8 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-white"
          >
            <span
              className={`size-5 rounded-full border border-white/30 transition-transform ${drawing.color === ink.value ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0b0b0c]' : ''}`}
              style={{ background: ink.value }}
            />
          </button>
        ))}
      </div>
      <span className="mx-1 h-6 w-px shrink-0 bg-white/15" aria-hidden="true" />
      <ViewerButton
        label="Undo"
        hint="⌘Z / Ctrl+Z"
        icon={UndoIcon}
        onClick={drawing.undo}
        disabled={drawing.strokes.length === 0}
      />
      <ViewerButton
        label="Clear drawing"
        hint="Removes every mark on this frame"
        icon={SelectionSlashIcon}
        onClick={drawing.clear}
        disabled={drawing.strokes.length === 0}
      />
    </div>
  );
}

/** Round icon button for the dark drawing screens, with a two-line tooltip. */
export function ViewerButton({
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
