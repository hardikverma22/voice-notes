import { formatDuration } from '../../lib/format';
import type { Segment } from '../transcribe/protocol';
import type { AudioPlayer } from './useAudioPlayer';

/** Timestamped segments from the final pass. Click one to play from there. */
export function TranscriptView({
  segments,
  player,
}: {
  segments: Segment[];
  player: AudioPlayer | null;
}) {
  const visible = segments.filter((segment) => segment.text.trim());
  if (visible.length === 0) {
    return <p className="py-8 text-center text-sm text-fg-muted">No timestamps for this note.</p>;
  }
  const now = player?.currentTime ?? -1;
  return (
    <ol className="flex flex-col gap-0.5">
      {visible.map((segment, index) => {
        const end = segment.end ?? visible[index + 1]?.start ?? Infinity;
        const active = player?.playing === true && now >= segment.start && now < end;
        return (
          <li key={index}>
            <button
              type="button"
              disabled={!player}
              onClick={() => {
                player?.seek(segment.start);
                player?.play();
              }}
              className={`flex w-full gap-4 rounded-md px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-focus disabled:cursor-default ${active ? 'bg-accent-soft' : 'enabled:hover:bg-surface-2'}`}
            >
              <span
                className={`tabular w-12 shrink-0 pt-0.5 text-xs font-semibold ${active ? 'text-accent' : 'text-fg-muted'}`}
              >
                {formatDuration(segment.start * 1000)}
              </span>
              <span className="leading-relaxed">{segment.text.trim()}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
