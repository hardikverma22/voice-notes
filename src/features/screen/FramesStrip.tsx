import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { ImagesIcon, PencilSimpleIcon } from '../../design/icons';
import { formatDuration } from '../../lib/format';
import type { Note } from '../../storage/db';
import { listNoteFrames } from '../../storage/frames';
import type { AudioPlayer } from '../notes/useAudioPlayer';
import { FrameImage } from './FrameImage';
import { FrameViewer } from './FrameViewer';
import { frameAt } from './timeline';
import { useFrameUrls } from './useFrameUrls';

/** The screen frames of a note, as a filmstrip that opens the viewer. */
export function FramesStrip({ note, player }: { note: Note; player: AudioPlayer | null }) {
  const frames = useLiveQuery(() => listNoteFrames(note.id), [note.id]);
  const urls = useFrameUrls(frames);
  const [open, setOpen] = useState<number | null>(null);
  if (!frames || frames.length === 0) return null;

  const current = player?.playing ? frameAt(frames, player.currentTime) : -1;
  const drawn = frames.filter((frame) => frame.strokes.length > 0).length;

  return (
    <section aria-labelledby="frames-heading" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="frames-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <ImagesIcon aria-hidden="true" className="size-4 text-fg-muted" />
          Screen
          <span className="tabular font-normal text-fg-muted">
            · {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
            {drawn > 0 ? `, ${drawn} marked up` : ''}
          </span>
        </h2>
        <p className="hidden text-xs text-fg-muted sm:block">Open a frame to draw on it</p>
      </div>
      <ol className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-1 pb-2" data-testid="frames">
        {frames.map((frame, index) => (
          <li key={frame.id} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => setOpen(index)}
              aria-label={`Frame ${index + 1} at ${formatDuration(frame.t * 1000)}${frame.strokes.length ? ', marked up' : ''}`}
              className={`group relative block w-40 overflow-hidden rounded-md border text-left shadow-sm transition-[border-color,transform] duration-(--vn-dur-fast) hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-48 ${index === current ? 'border-accent ring-2 ring-accent/40' : 'border-border'}`}
            >
              <FrameImage frame={frame} url={urls.get(frame.id)} alt="" />
              <span className="tabular absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-1.5 py-0.5 text-[0.7rem] font-medium text-white">
                {formatDuration(frame.t * 1000)}
              </span>
              {frame.strokes.length > 0 ? (
                <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-black/70 text-white">
                  <PencilSimpleIcon aria-hidden="true" weight="bold" className="size-3.5" />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ol>
      {open !== null && frames[open] ? (
        <FrameViewer
          frames={frames}
          urls={urls}
          index={open}
          segments={note.segments}
          player={player}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
