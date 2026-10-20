import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, m } from 'motion/react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { navigate, useHashRoute } from '../../app/router';
import { IconButton } from '../../design/components/Button';
import { Kbd } from '../../design/components/Kbd';
import { useToast } from '../../design/components/useToast';
import {
  MagnifyingGlassIcon,
  MicrophoneIcon,
  NotePencilIcon,
  PushPinIcon,
  WaveformIcon,
  XIcon,
} from '../../design/icons';
import { formatDuration } from '../../lib/format';
import type { Note } from '../../storage/db';
import { listNotes, setPinned } from '../../storage/notes';
import { createTextNote } from './createTextNote';
import { filterNotes, groupNotes, listTime, snippet } from './groupNotes';
import { Highlight } from './Highlight';
import { StatusBadge } from './StatusBadge';

export const FOCUS_SEARCH_EVENT = 'vn:focus-search';

type Filter = 'all' | 'pinned' | 'audio';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pinned', label: 'Pinned' },
  { value: 'audio', label: 'With audio' },
];

/**
 * Searchable list of every saved note. "sidebar" is the desktop left pane, "page" the
 * stacked list under the recorder on phones.
 */
export function NotesLibrary({ variant }: { variant: 'sidebar' | 'page' }) {
  const notes = useLiveQuery(() => listNotes(), []);
  const route = useHashRoute();
  const activeId = route.name === 'note' ? route.id : null;
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filter, setFilter] = useState<Filter>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const focus = () => {
      const input = inputRef.current;
      // Both variants can be mounted; only the visible one takes focus.
      if (input && input.offsetParent !== null) {
        input.focus();
        input.select();
      }
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, focus);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, focus);
  }, []);

  if (!notes) return <LibrarySkeleton />;

  const filtered = filterNotes(
    notes.filter((note) =>
      filter === 'pinned' ? note.pinned : filter === 'audio' ? note.audioId !== null : true,
    ),
    deferredQuery,
  );
  const groups = groupNotes(filtered);
  const totalMinutes = Math.round(notes.reduce((sum, note) => sum + note.durationMs, 0) / 60_000);

  return (
    <div className={`flex min-h-0 flex-col ${variant === 'sidebar' ? 'flex-1' : ''}`}>
      <div className={variant === 'sidebar' ? 'px-3 pb-2' : 'pb-3'}>
        {variant === 'page' ? (
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl font-medium">Your notes</h2>
              <p className="mt-0.5 text-xs text-fg-muted">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'} · {totalMinutes} min recorded
              </p>
            </div>
            <NewTextNoteButton />
          </div>
        ) : null}

        <label className="group relative flex items-center">
          <span className="sr-only">Search notes</span>
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 size-4.5 text-fg-muted"
          />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation();
                setQuery('');
              }
            }}
            placeholder="Search notes"
            className="min-h-11 w-full rounded-full border border-border bg-surface pr-16 pl-10 text-[0.95rem] shadow-sm outline-none transition-shadow placeholder:text-fg-muted focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 [&::-webkit-search-cancel-button]:hidden"
          />
          <span className="absolute right-2 flex items-center gap-1">
            {query ? (
              <IconButton
                icon={XIcon}
                label="Clear search"
                size="sm"
                onClick={() => setQuery('')}
              />
            ) : (
              <span className="hidden items-center gap-0.5 pr-2 sm:flex" aria-hidden="true">
                <Kbd>⌘K</Kbd>
              </span>
            )}
          </span>
        </label>

        <div role="group" aria-label="Filter notes" className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
              className="min-h-8 rounded-full border border-border px-3 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus aria-pressed:border-fg aria-pressed:bg-fg aria-pressed:text-bg"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={
          variant === 'sidebar' ? 'vn-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-6' : ''
        }
      >
        {notes.length === 0 ? (
          <EmptyLibrary />
        ) : groups.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-fg-muted" role="status">
            {deferredQuery ? <>No notes match “{deferredQuery}”.</> : 'Nothing here yet.'}
          </p>
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            {deferredQuery ? (
              <p className="px-2 text-xs text-fg-muted" role="status">
                {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
              </p>
            ) : null}
            {groups.map((group) => (
              <section key={group.label} aria-label={group.label}>
                <h3 className="mb-1.5 flex items-center gap-1.5 px-2 text-[0.7rem] font-semibold tracking-wider text-fg-muted uppercase">
                  {group.label === 'Pinned' ? (
                    <PushPinIcon aria-hidden="true" weight="fill" className="size-3" />
                  ) : null}
                  {group.label}
                </h3>
                <ul className="flex flex-col gap-1">
                  <AnimatePresence initial={false}>
                    {group.notes.map((note) => (
                      <NoteRow
                        key={note.id}
                        note={note}
                        query={deferredQuery}
                        active={note.id === activeId}
                        compact={variant === 'sidebar'}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteRow({
  note,
  query,
  active,
  compact,
}: {
  note: Note;
  query: string;
  active: boolean;
  compact: boolean;
}) {
  const toast = useToast();
  const text = snippet(note.plainText, query, compact ? 110 : 160);
  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
      className="group relative"
    >
      <a
        href={`#/note/${note.id}`}
        aria-current={active ? 'page' : undefined}
        className={`block rounded-md px-3 py-3 pr-11 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${active ? 'bg-accent-soft' : compact ? 'hover:bg-surface-2' : 'border border-border bg-surface shadow-sm hover:border-control'}`}
      >
        <span className="flex items-baseline justify-between gap-3">
          <span
            className={`min-w-0 truncate font-semibold ${compact ? 'text-sm' : 'text-[0.95rem]'}`}
          >
            <Highlight text={note.title || 'Untitled note'} query={query} />
          </span>
          <span className="tabular shrink-0 text-xs text-fg-muted">{listTime(note.createdAt)}</span>
        </span>
        {text ? (
          <span
            className={`mt-1 line-clamp-2 block text-fg-muted ${compact ? 'text-[0.8rem] leading-snug' : 'text-sm'}`}
          >
            <Highlight text={text} query={query} />
          </span>
        ) : note.status === 'queued' || note.status === 'transcribing' ? (
          <span className="mt-2 block space-y-1.5" aria-hidden="true">
            <span className="vn-shimmer block h-2.5 w-11/12 rounded-full" />
            <span className="vn-shimmer block h-2.5 w-2/3 rounded-full" />
          </span>
        ) : (
          <span className="mt-1 block text-[0.8rem] text-fg-muted italic">No text</span>
        )}
        <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          {note.audioId ? (
            <span className="tabular inline-flex items-center gap-1">
              <WaveformIcon aria-hidden="true" className="size-3.5" />
              {formatDuration(note.durationMs)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <NotePencilIcon aria-hidden="true" className="size-3.5" />
              Text note
            </span>
          )}
          <StatusBadge status={note.status} showReady={false} />
        </span>
      </a>
      <div className="absolute top-2 right-1.5">
        <IconButton
          icon={PushPinIcon}
          label={note.pinned ? 'Unpin note' : 'Pin note'}
          size="sm"
          active={note.pinned}
          aria-pressed={note.pinned}
          onClick={() => {
            void setPinned(note.id, !note.pinned);
            toast.show({ message: note.pinned ? 'Unpinned' : 'Pinned to top', durationMs: 2500 });
          }}
          className={
            note.pinned
              ? ''
              : 'opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100'
          }
        />
      </div>
    </m.li>
  );
}

export function NewTextNoteButton() {
  return (
    <button
      type="button"
      onClick={() => void createTextNote().then((id) => navigate(`/note/${id}`))}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      <NotePencilIcon aria-hidden="true" className="size-4" />
      Text note
    </button>
  );
}

function EmptyLibrary() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <MicrophoneIcon aria-hidden="true" weight="fill" className="size-6" />
      </span>
      <p className="font-medium">No notes yet</p>
      <p className="max-w-xs text-sm text-fg-muted">
        Record your first thought. Each recording is saved here with its audio and transcript.
      </p>
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 pt-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="vn-shimmer h-16 rounded-md" />
      ))}
    </div>
  );
}
