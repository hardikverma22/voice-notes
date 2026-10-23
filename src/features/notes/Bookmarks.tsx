import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { IconButton } from '../../design/components/Button';
import { useToast } from '../../design/components/useToast';
import { BookmarkSimpleIcon, XIcon } from '../../design/icons';
import { formatDuration } from '../../lib/format';
import type { Bookmark } from '../../storage/db';
import { removeBookmark, restoreBookmark, updateBookmark } from '../../storage/notes';
import type { AudioPlayer } from './useAudioPlayer';

/**
 * Marked moments of a note's recording, made with the Mark button in the player or the M key
 * while recording. The time plays from that moment; the label is optional and edited in place.
 */
export function BookmarkList({
  noteId,
  bookmarks,
  player,
  newId,
}: {
  noteId: string;
  bookmarks: Bookmark[];
  player: AudioPlayer | null;
  /** The moment just marked, briefly highlighted so the eye finds it. */
  newId: string | null;
}) {
  const toast = useToast();
  if (bookmarks.length === 0) return null;

  async function remove(bookmark: Bookmark) {
    const removed = await removeBookmark(noteId, bookmark.id);
    if (!removed) return;
    toast.show({
      message: 'Moment removed',
      actions: [{ label: 'Undo', onClick: () => void restoreBookmark(noteId, removed) }],
      durationMs: 5000,
    });
  }

  return (
    <section aria-labelledby="moments-heading" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2
          id="moments-heading"
          className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted"
        >
          <BookmarkSimpleIcon aria-hidden="true" weight="fill" className="size-3.5 text-accent" />
          Marked moments
          <span className="tabular font-normal">· {bookmarks.length}</span>
        </h2>
        <p className="text-xs text-fg-muted">Tap a time to play it. Labels are optional.</p>
      </div>
      <ol className="flex flex-col">
        <AnimatePresence initial={false}>
          {bookmarks.map((bookmark) => (
            <m.li
              key={bookmark.id}
              layout="position"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.15 } }}
              className="overflow-hidden"
            >
              <BookmarkRow
                noteId={noteId}
                bookmark={bookmark}
                player={player}
                isNew={bookmark.id === newId}
                onRemove={() => void remove(bookmark)}
              />
            </m.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function BookmarkRow({
  noteId,
  bookmark,
  player,
  isNew,
  onRemove,
}: {
  noteId: string;
  bookmark: Bookmark;
  player: AudioPlayer | null;
  isNew: boolean;
  onRemove: () => void;
}) {
  const [label, setLabel] = useState(bookmark.label);
  const time = formatDuration(bookmark.t * 1000);

  function save() {
    const next = label.trim();
    if (next !== bookmark.label) void updateBookmark(noteId, bookmark.id, next);
  }

  return (
    <div className="group relative flex items-center gap-1 rounded-md pr-0.5 transition-[background-color,box-shadow] focus-within:bg-surface-2 focus-within:ring-1 focus-within:ring-control/50 focus-within:ring-inset hover:bg-surface-2">
      {isNew ? (
        <m.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md bg-accent-soft"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeOut', delay: 0.4 }}
        />
      ) : null}
      <button
        type="button"
        disabled={!player}
        onClick={() => {
          player?.seek(bookmark.t);
          player?.play();
        }}
        aria-label={`Play from ${time}`}
        className="tabular relative min-h-10 w-16 shrink-0 rounded-sm px-2 text-left text-xs font-semibold text-accent transition-colors enabled:hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:text-fg-muted"
      >
        {time}
      </button>
      <input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            event.stopPropagation();
            setLabel(bookmark.label);
            const field = event.currentTarget;
            requestAnimationFrame(() => field.blur());
          }
        }}
        maxLength={120}
        placeholder="Add a label (optional)"
        aria-label={`Label for moment at ${time}`}
        className="relative min-h-10 min-w-0 flex-1 bg-transparent px-2 text-base caret-accent outline-none placeholder:text-fg-muted/80 sm:text-sm"
      />
      <IconButton
        icon={XIcon}
        size="sm"
        label={`Remove moment at ${time}`}
        onClick={onRemove}
        className="relative sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
      />
    </div>
  );
}
