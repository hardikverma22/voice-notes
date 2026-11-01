import type { Frame, Stroke } from '../../storage/db';
import { strokeOpacity, strokePath, strokeWidth } from './annotation';

/** The drawing over a frame, as SVG in the frame's own pixel space. */
export function StrokeLayer({
  frame,
  strokes,
  className = '',
}: {
  frame: Pick<Frame, 'width' | 'height'>;
  strokes: Stroke[];
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${frame.width} ${frame.height}`}
      preserveAspectRatio="none"
      className={`absolute inset-0 size-full ${className}`}
    >
      {strokes.map((stroke) => (
        <path
          key={stroke.id}
          d={strokePath(stroke, frame.width, frame.height)}
          fill="none"
          stroke={stroke.color}
          strokeOpacity={strokeOpacity(stroke.tool)}
          strokeWidth={strokeWidth(stroke.tool, frame.width)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** A frame and its drawing, scaled to fit its box. */
export function FrameImage({
  frame,
  url,
  alt,
  className = '',
}: {
  frame: Frame;
  url: string | undefined;
  alt: string;
  className?: string;
}) {
  return (
    <span
      className={`relative block overflow-hidden bg-surface-2 ${className}`}
      style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      <StrokeLayer frame={frame} strokes={frame.strokes} />
    </span>
  );
}
