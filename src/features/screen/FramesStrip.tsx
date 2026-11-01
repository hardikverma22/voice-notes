import { useEffect, useRef, useState } from 'react';
import { Button } from '../../design/components/Button';
import {
  FileZipIcon,
  FilmStripIcon,
  ImagesIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
} from '../../design/icons';
import { formatDuration } from '../../lib/format';
import type { Frame, Note } from '../../storage/db';
import type { AudioPlayer } from '../notes/useAudioPlayer';
import { FrameImage } from './FrameImage';
import { FrameViewer } from './FrameViewer';
import { frameDuring, pairSpeech, playFrom, segmentAt } from './timeline';
import { useFrameUrls } from './useFrameUrls';

/**
 * A note's screen recording: a large stage showing the frame that was on screen, which
 * follows the audio as it plays, and a filmstrip of every frame. Opens the full-screen viewer
 * to mark a frame up.
 */
export function FramesStrip({
  note,
  frames,
  player,
  onExport,
  exporting,
  onExportVideo,
  videoProgress,
}: {
  note: Note;
  /** The note's frames in time order; undefined while loading. */
  frames: Frame[] | undefined;
  player: AudioPlayer | null;
  /** Zips the note with its frames for an AI agent. */
  onExport(): void;
  exporting: boolean;
  /** Renders the note as an MP4. */
  onExportVideo(): void;
  /** 0..1 while the video renders, otherwise null. */
  videoProgress: number | null;
}) {
  const urls = useFrameUrls(frames);
  const [open, setOpen] = useState<number | null>(null);
  const [picked, setPicked] = useState(0);
  const stripRef = useRef<HTMLOListElement>(null);

  const playing = player?.playing ?? false;
  const now = player?.currentTime ?? 0;
  const count = frames?.length ?? 0;
  // While playing, the stage follows the audio; afterwards it stays on the last frame shown.
  const live = playing && frames ? frameDuring(frames, now) : -1;
  if (live >= 0 && live !== picked) setPicked(live);
  const shown = Math.min(picked, Math.max(0, count - 1));

  useEffect(() => {
    const item = stripRef.current?.children[shown] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [shown]);

  if (!frames || frames.length === 0) return null;
  const frame = frames[shown]!;
  const drawn = frames.filter((entry) => entry.strokes.length > 0).length;
  const spoken = pairSpeech(frames, note.segments)[shown]?.segments ?? [];
  const speaking = playing ? segmentAt(spoken, now) : -1;
  const caption =
    speaking >= 0
      ? spoken[speaking]!.text.trim()
      : spoken
          .map((segment) => segment.text.trim())
          .join(' ')
          .trim();

  function pick(index: number) {
    setPicked(index);
    if (player && frames) player.seek(playFrom(frames[index]!));
  }

  function togglePlay() {
    if (!player || !frames) return;
    if (player.playing) return player.toggle();
    if (frameDuring(frames, player.currentTime) !== shown) player.seek(playFrom(frame));
    player.play();
  }

  return (
    <section aria-labelledby="frames-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="frames-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <ImagesIcon aria-hidden="true" className="size-4 text-fg-muted" />
          Screen
          <span className="tabular font-normal text-fg-muted">
            · {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
            {drawn > 0 ? `, ${drawn} marked up` : ''}
          </span>
        </h2>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            icon={FilmStripIcon}
            onClick={onExportVideo}
            disabled={videoProgress !== null}
            data-tip={
              'Export video\nAn MP4 of your screen, marks and voice, with captions. Made on this device.'
            }
            data-tip-align="end"
          >
            {videoProgress !== null ? `Rendering ${Math.round(videoProgress * 100)}%` : 'Video'}
          </Button>
          <Button
            size="sm"
            variant="soft"
            icon={FileZipIcon}
            onClick={onExport}
            disabled={exporting}
            data-tip={
              'Export for agent\nA zip with report.md for AI agents, report.html for people, the frames and the audio'
            }
            data-tip-align="end"
          >
            {exporting ? 'Preparing…' : 'Export for agent'}
          </Button>
        </div>
      </div>

      <div
        className="group relative overflow-hidden rounded-lg border border-border bg-black shadow-md"
        data-testid="frame-stage"
      >
        <button
          type="button"
          onClick={() => setOpen(shown)}
          aria-label={`Open frame ${shown + 1} to mark it up`}
          className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
        >
          <FrameImage
            frame={frame}
            url={urls.get(frame.id)}
            alt={`Frame ${shown + 1} at ${formatDuration(frame.t * 1000)}`}
            className="bg-black [&_img]:object-contain"
          />
        </button>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-10">
          {player ? (
            <button
              type="button"
              onClick={togglePlay}
              aria-label={playing ? 'Pause' : `Play from frame ${shown + 1}`}
              data-tip={playing ? 'Pause' : 'Play from this frame\nThe screen follows along'}
              data-tip-side="top"
              data-tip-align="start"
              className="pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {playing ? (
                <PauseIcon aria-hidden="true" weight="fill" className="size-5" />
              ) : (
                <PlayIcon aria-hidden="true" weight="fill" className="ml-0.5 size-5" />
              )}
            </button>
          ) : null}
          <p className="line-clamp-2 min-w-0 flex-1 text-sm text-pretty text-white/90">
            {caption || <span className="text-white/60">Nothing said on this frame.</span>}
          </p>
          <span className="tabular shrink-0 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">
            {shown + 1}/{frames.length} · {formatDuration(frame.t * 1000)}
          </span>
        </div>
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(shown)}
            data-tip={'Mark up\nDraw arrows, boxes and highlights'}
            data-tip-align="end"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-black/70 px-3 text-sm font-medium text-white backdrop-blur hover:bg-black focus-visible:outline-2 focus-visible:outline-white"
          >
            <PencilSimpleIcon aria-hidden="true" weight="bold" className="size-4" />
            Mark up
          </button>
        </div>
      </div>

      <ol
        ref={stripRef}
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-1 pb-2"
        data-testid="frames"
      >
        {frames.map((entry, index) => (
          <li key={entry.id} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => pick(index)}
              onDoubleClick={() => setOpen(index)}
              aria-current={index === shown ? 'true' : undefined}
              aria-label={`Frame ${index + 1} at ${formatDuration(entry.t * 1000)}${entry.strokes.length ? ', marked up' : ''}`}
              className={`group relative block w-32 overflow-hidden rounded-md border-2 text-left shadow-sm transition-[border-color,opacity] duration-(--vn-dur-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-36 ${index === shown ? 'border-accent' : 'border-transparent opacity-70 hover:opacity-100'}`}
            >
              <FrameImage frame={entry} url={urls.get(entry.id)} alt="" />
              <span className="tabular absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[0.7rem] font-medium text-white">
                {formatDuration(entry.t * 1000)}
              </span>
              {entry.strokes.length > 0 ? (
                <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/70 text-white">
                  <PencilSimpleIcon aria-hidden="true" weight="bold" className="size-3" />
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
          onIndex={(index) => {
            setOpen(index);
            setPicked(index);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </section>
  );
}
