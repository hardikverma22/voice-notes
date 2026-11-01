import { useCallback, useState, type PointerEvent } from 'react';
import { useToast } from '../../design/components/useToast';
import type { Frame, Stroke } from '../../storage/db';
import { setFrameStrokes } from '../../storage/frames';
import { INK, TOOLS, isNegligible, thin, type Tool } from './annotation';

/**
 * Drawing on a frame, shared by the frame viewer and drawing during a recording: the tool
 * and ink state, the strokes (saved to IndexedDB as they change), and pointer handling.
 */

export interface Drawing {
  tool: Tool;
  setTool(tool: Tool): void;
  color: string;
  setColor(color: string): void;
  strokes: Stroke[];
  /** The strokes plus the one being drawn. */
  shown: Stroke[];
  drawing: boolean;
  undo(): void;
  clear(): void;
  /** Handles 1–4 (tools) and ⌘Z / Ctrl+Z. True when the key was used. */
  onKey(event: React.KeyboardEvent): boolean;
  surfaceHandlers: {
    onPointerDown(event: PointerEvent): void;
    onPointerMove(event: PointerEvent): void;
    onPointerUp(): void;
    onPointerCancel(): void;
  };
}

export function useDrawing(frame: Frame): Drawing {
  const toast = useToast();
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState<string>(INK[0].value);
  const [strokes, setStrokes] = useState<Stroke[]>(frame.strokes);
  const [draft, setDraft] = useState<Stroke | null>(null);

  // Another frame is shown: show its drawing.
  const [shownId, setShownId] = useState(frame.id);
  if (shownId !== frame.id) {
    setShownId(frame.id);
    setStrokes(frame.strokes);
    setDraft(null);
  }

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

  function pointAt(event: PointerEvent): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    const clamp = (n: number) => Math.min(1, Math.max(0, n));
    return [
      clamp((event.clientX - rect.left) / rect.width),
      clamp((event.clientY - rect.top) / rect.height),
    ];
  }

  function finish() {
    if (!draft) return;
    const done = { ...draft, points: thin(draft.points) };
    setDraft(null);
    if (!isNegligible(done)) save([...strokes, done]);
  }

  return {
    tool,
    setTool,
    color,
    setColor,
    strokes,
    shown: draft ? [...strokes, draft] : strokes,
    drawing: draft !== null,
    undo,
    clear: () => save([]),
    onKey(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
        return true;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return false;
      const match = TOOLS.find((entry) => entry.key === event.key);
      if (match) setTool(match.tool);
      return Boolean(match);
    },
    surfaceHandlers: {
      onPointerDown(event) {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const point = pointAt(event);
        setDraft({ id: crypto.randomUUID(), tool, color, points: [point, point] });
      },
      onPointerMove(event) {
        if (!draft) return;
        const point = pointAt(event);
        setDraft(
          draft.tool === 'pen' || draft.tool === 'highlighter'
            ? { ...draft, points: [...draft.points, point] }
            : { ...draft, points: [draft.points[0]!, point] },
        );
      },
      onPointerUp: finish,
      onPointerCancel: finish,
    },
  };
}
