import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { IconButton } from '../../design/components/Button';
import {
  BookmarkSimpleIcon,
  ClockClockwiseIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  PauseIcon,
  PlayIcon,
} from '../../design/icons';
import { formatDuration } from '../../lib/format';
import type { Bookmark } from '../../storage/db';
import { computePeaks, decodeToPcm16k } from '../recorder/decode';
import type { AudioPlayer as Player } from './useAudioPlayer';

const BARS = 96;
const peakCache = new Map<string, number[]>();

/**
 * Static waveform of the recording, filled up to the play position. Click or drag to seek.
 * Marked moments sit as pins above the waveform; the list below the player is their keyboard
 * path.
 */
export function AudioPlayer({
  player,
  blob,
  cacheKey,
  onDownload,
  bookmarks = [],
  onBookmark,
}: {
  player: Player;
  blob: Blob;
  cacheKey: string;
  onDownload: () => void;
  bookmarks?: Bookmark[];
  /** Marks the current play position. */
  onBookmark?: () => void;
}) {
  const [peaks, setPeaks] = useState<number[] | null>(() => peakCache.get(cacheKey) ?? null);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (peakCache.has(cacheKey)) return;
    let cancelled = false;
    decodeToPcm16k(blob)
      .then((pcm) => {
        const result = computePeaks(pcm, BARS);
        peakCache.set(cacheKey, result);
        if (!cancelled) setPeaks(result);
      })
      .catch(() => {
        if (!cancelled) setPeaks(new Array<number>(BARS).fill(0.15));
      });
    return () => {
      cancelled = true;
    };
  }, [blob, cacheKey]);

  const progress = player.duration > 0 ? Math.min(1, player.currentTime / player.duration) : 0;

  function seekFromPointer(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || player.duration <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    player.seek(ratio * player.duration);
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 shadow-sm sm:p-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <m.button
          type="button"
          onClick={player.toggle}
          aria-label={player.playing ? 'Pause' : 'Play recording'}
          whileTap={{ scale: 0.92 }}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {player.playing ? (
            <PauseIcon aria-hidden="true" weight="fill" className="size-5" />
          ) : (
            <PlayIcon aria-hidden="true" weight="fill" className="ml-0.5 size-5" />
          )}
        </m.button>

        <div className="relative min-w-0 flex-1">
          {player.duration > 0 && bookmarks.length > 0 ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-2.5 h-3">
              <AnimatePresence initial={false}>
                {bookmarks.map((bookmark) => {
                  const at = Math.min(1, bookmark.t / player.duration);
                  return (
                    <m.button
                      key={bookmark.id}
                      type="button"
                      tabIndex={-1}
                      title={`${formatDuration(bookmark.t * 1000)}${bookmark.label ? ` · ${bookmark.label}` : ''}`}
                      onClick={() => {
                        player.seek(bookmark.t);
                        player.play();
                      }}
                      initial={{ opacity: 0, y: -8, scale: 0.4 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.12 } }}
                      className="pointer-events-auto absolute top-0 flex h-full w-5 -translate-x-1/2 cursor-pointer justify-center"
                      style={{ left: `${at * 100}%` }}
                    >
                      <span className="size-2 rotate-45 rounded-[2px] bg-accent shadow-sm ring-2 ring-surface" />
                    </m.button>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : null}
          <div
            ref={trackRef}
            role="slider"
            tabIndex={0}
            aria-label="Playback position"
            aria-valuemin={0}
            aria-valuemax={Math.round(player.duration)}
            aria-valuenow={Math.round(player.currentTime)}
            aria-valuetext={`${formatDuration(player.currentTime * 1000)} of ${formatDuration(player.duration * 1000)}`}
            onPointerDown={(event) => {
              draggingRef.current = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              seekFromPointer(event.clientX);
            }}
            onPointerMove={(event) => {
              if (draggingRef.current) seekFromPointer(event.clientX);
            }}
            onPointerUp={() => {
              draggingRef.current = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') {
                event.preventDefault();
                player.skip(5);
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                player.skip(-5);
              } else if (event.key === 'Home') {
                event.preventDefault();
                player.seek(0);
              } else if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                player.toggle();
              }
            }}
            className="flex h-12 cursor-pointer touch-none items-center gap-[2px] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
          >
            {(peaks ?? new Array<number>(BARS).fill(0)).map((peak, index) => {
              const played = (index + 0.5) / BARS <= progress;
              return (
                <span
                  key={index}
                  className={`min-w-0 flex-1 rounded-full transition-colors duration-150 ${peaks ? '' : 'vn-shimmer'} ${played ? 'bg-accent' : 'bg-border'}`}
                  style={{ height: `${Math.max(8, (peaks ? peak : 0.2) * 100)}%` }}
                />
              );
            })}
          </div>
          <div className="tabular mt-1 flex justify-between text-xs text-fg-muted">
            <span>{formatDuration(player.currentTime * 1000)}</span>
            <span>{formatDuration(player.duration * 1000)}</span>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-1 border-t border-border pt-2">
        <div className="flex items-center gap-1">
          <IconButton
            icon={ClockCounterClockwiseIcon}
            label="Back 10 seconds"
            size="sm"
            onClick={() => player.skip(-10)}
          />
          <IconButton
            icon={ClockClockwiseIcon}
            label="Forward 10 seconds"
            size="sm"
            onClick={() => player.skip(10)}
          />
          <button
            type="button"
            onClick={player.cycleRate}
            aria-label={`Playback speed ${player.rate}x. Change speed`}
            className="tabular min-h-9 min-w-12 rounded-full px-2 text-xs font-semibold text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
          >
            {player.rate}×
          </button>
          {onBookmark ? (
            <button
              type="button"
              onClick={onBookmark}
              title="Mark this moment so you can jump back to it"
              className="ml-1 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-medium text-fg-muted transition-[background-color,color,transform] duration-(--vn-dur-fast) hover:bg-surface-2 hover:text-fg active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-focus"
            >
              <BookmarkSimpleIcon aria-hidden="true" className="size-4" />
              Mark <span className="tabular">{formatDuration(player.currentTime * 1000)}</span>
            </button>
          ) : null}
        </div>
        <IconButton
          icon={DownloadSimpleIcon}
          label="Download audio"
          size="sm"
          onClick={onDownload}
        />
      </div>
    </div>
  );
}
