import type { Frame, Stroke } from '../../storage/db';

/**
 * Geometry for drawings over screen frames. Each stroke becomes one SVG path string, used
 * both by the on-screen overlay (<path d>) and when a frame is flattened to an image
 * (new Path2D(d)), so what is exported matches what was drawn.
 */

export type Tool = Stroke['tool'];

/** Ink colours. Fixed, not themed: they mark up screenshots, which have their own colours. */
export const INK = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'White', value: '#ffffff' },
] as const;

export const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'pen', label: 'Pen', key: '1' },
  { tool: 'highlighter', label: 'Highlighter', key: '2' },
  { tool: 'arrow', label: 'Arrow', key: '3' },
  { tool: 'box', label: 'Box', key: '4' },
];

/** Line width in pixels for a frame this wide. */
export function strokeWidth(tool: Tool, frameWidth: number): number {
  const ratio = tool === 'highlighter' ? 0.016 : tool === 'pen' ? 0.0035 : 0.0045;
  return Math.max(tool === 'highlighter' ? 8 : 2, frameWidth * ratio);
}

export function strokeOpacity(tool: Tool): number {
  return tool === 'highlighter' ? 0.38 : 1;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Drops points that are closer than minGap (0..1 units) to the last kept one, so a stroke
 * stays small. Always keeps the first and last point.
 */
export function thin(points: [number, number][], minGap = 0.002): [number, number][] {
  if (points.length <= 2) return points;
  const out: [number, number][] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!;
    const [lx, ly] = out[out.length - 1]!;
    if (Math.hypot(x - lx, y - ly) >= minGap) out.push(points[i]!);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** SVG path data for a stroke on a frame of width x height pixels. */
export function strokePath(stroke: Stroke, width: number, height: number): string {
  const pts = stroke.points.map(([x, y]) => [round(x * width), round(y * height)] as const);
  if (pts.length === 0) return '';
  const [x0, y0] = pts[0]!;
  const [x1, y1] = pts[pts.length - 1]!;

  if (stroke.tool === 'box') {
    return `M${x0} ${y0}H${x1}V${y1}H${x0}Z`;
  }
  if (stroke.tool === 'arrow') {
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 1) return `M${x0} ${y0}L${x1} ${y1}`;
    const head = Math.min(length * 0.45, strokeWidth('arrow', width) * 5);
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const spread = Math.PI / 7;
    const ax = round(x1 - head * Math.cos(angle - spread));
    const ay = round(y1 - head * Math.sin(angle - spread));
    const bx = round(x1 - head * Math.cos(angle + spread));
    const by = round(y1 - head * Math.sin(angle + spread));
    return `M${x0} ${y0}L${x1} ${y1}M${ax} ${ay}L${x1} ${y1}L${bx} ${by}`;
  }
  // Pen and highlighter: a smooth curve through the midpoints of the samples.
  if (pts.length === 1) return `M${x0} ${y0}L${x0 + 0.1} ${y0}`;
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [cx, cy] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += `Q${cx} ${cy} ${round((cx + nx) / 2)} ${round((cy + ny) / 2)}`;
  }
  return `${d}L${x1} ${y1}`;
}

/** True when the stroke is too small to mean anything (a stray click with arrow or box). */
export function isNegligible(stroke: Stroke): boolean {
  if (stroke.tool === 'pen' || stroke.tool === 'highlighter') return stroke.points.length === 0;
  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  if (!first || !last) return true;
  return Math.hypot(last[0] - first[0], last[1] - first[1]) < 0.01;
}

/** The frame with its drawing flattened into one PNG. Frames without a drawing are returned as is. */
export async function flattenFrame(frame: Frame): Promise<Blob> {
  if (frame.strokes.length === 0) return frame.blob;
  const bitmap = await createImageBitmap(frame.blob);
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return frame.blob;
  ctx.drawImage(bitmap, 0, 0, frame.width, frame.height);
  bitmap.close();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of frame.strokes) {
    ctx.globalAlpha = strokeOpacity(stroke.tool);
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = strokeWidth(stroke.tool, frame.width);
    ctx.stroke(new Path2D(strokePath(stroke, frame.width, frame.height)));
  }
  ctx.globalAlpha = 1;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ?? frame.blob;
}
