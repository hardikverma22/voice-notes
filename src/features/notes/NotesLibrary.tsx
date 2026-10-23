import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, m } from 'motion/react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { navigate, useHashRoute } from '../../app/router';
import { IconButton } from '../../design/components/Button';
import { Menu, type MenuItem } from '../../design/components/Menu';
import { Kbd } from '../../design/components/Kbd';
import { useToast } from '../../design/components/useToast';
import {
  BookmarkSimpleIcon,
  CopyIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  PencilSimpleIcon,
  PushPinSlashIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  MicrophoneIcon,
  NotePencilIcon,
  PushPinIcon,
  WaveformIcon,
  XIcon,
} from '../../design/icons';
import { formatDuration } from '../../lib/format';
import { collectTags } from '../../lib/tags';
import type { Note } from '../../storage/db';
import { getAudio } from '../../storage/audio';
import { deleteNote, listNotes, renameNote, restoreNote, setPinned } from '../../storage/notes';
import { extensionFor } from '../recorder/mime';
import { downloadBlob, fileNameFor } from './exportNote';
import { MeaningResults } from '../search/MeaningResults';
import { ImportButton } from '../import/ImportControls';
import { TasksLink } from '../tasks/TasksLink';
import { createTextNote } from './createTextNote';
import { filterNotes, groupNotes, listTime, snippet } from './groupNotes';
import { Highlight } from './Highlight';
import { StatusBadge } from './StatusBadge';

export const FOCUS_SEARCH_EVENT = 'vn:focus-search';

type Filter = 'all' | 'pinned' | 'audio';
const VISIBLE_TAGS = 6;
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
  const [tag, setTag] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
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

  const tags = collectTags(notes);
  // A tag removed from its last note drops out of the filter.
  const activeTag = tag && tags.some((t) => t.tag === tag) ? tag : null;
  const shownTags = showAllTags ? tags : tags.slice(0, VISIBLE_TAGS);
  if (activeTag && !shownTags.some((t) => t.tag === activeTag)) {
    shownTags.push(tags.find((t) => t.tag === activeTag)!);
  }
  const scoped = notes.filter(
    (note) =>
      (filter === 'pinned' ? note.pinned : filter === 'audio' ? note.audioId !== null : true) &&
      (!activeTag || note.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase())),
  );
  const filtered = filterNotes(scoped, deferredQuery);
  // Search by meaning skips exact matches and anything the filters hide.
  const scopedIds = new Set(scoped.map((note) => note.id));
  const meaningExclude = [
    ...filtered.map((note) => note.id),
    ...notes.filter((note) => !scopedIds.has(note.id)).map((note) => note.id),
  ];
  const scopeLabel = [
    filter === 'pinned' ? 'pinned' : filter === 'audio' ? 'recorded' : '',
    'notes',
    activeTag ? `tagged #${activeTag}` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const groups = groupNotes(filtered);
  const totalMinutes = Math.round(notes.reduce((sum, note) => sum + note.durationMs, 0) / 60_000);

  return (
    <div className={`flex min-h-0 flex-col ${variant === 'sidebar' ? 'flex-1' : ''}`}>
      <div className={variant === 'sidebar' ? 'px-3 pb-2' : 'pb-3'}>
        {variant === 'page' ? (
          <div className="mb-4 flex flex-col gap-3">
            <div>
              <h2 className="font-serif text-2xl font-medium">Your notes</h2>
              <p className="mt-0.5 text-xs text-fg-muted">
                {notes.length} {notes.length === 1 ? 'note' : 'notes'} · {totalMinutes} min recorded
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <TasksLink variant="chip" active={false} />
              <ImportButton variant="chip" />
              <NewTextNoteButton />
            </div>
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

        {tags.length > 0 ? (
          <div role="group" aria-label="Filter by tag" className="mt-2 flex flex-wrap gap-1.5">
            {shownTags.map((entry) => (
              <button
                key={entry.tag}
                type="button"
                aria-pressed={activeTag === entry.tag}
                onClick={() => setTag(activeTag === entry.tag ? null : entry.tag)}
                title={`${entry.count} ${entry.count === 1 ? 'note' : 'notes'}`}
                className="inline-flex min-h-8 max-w-48 items-center rounded-full px-2.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus aria-pressed:bg-accent-soft aria-pressed:text-accent"
              >
                <span aria-hidden="true" className="opacity-60">
                  #
                </span>
                <span className="truncate">{entry.tag}</span>
              </button>
            ))}
            {tags.length > VISIBLE_TAGS ? (
              <button
                type="button"
                aria-expanded={showAllTags}
                onClick={() => setShowAllTags((v) => !v)}
                className="min-h-8 rounded-full px-2.5 text-xs font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-2 focus-visible:outline-focus"
              >
                {showAllTags ? 'Fewer tags' : `+${tags.length - VISIBLE_TAGS} more`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        className={
          variant === 'sidebar' ? 'vn-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-6' : ''
        }
      >
        {notes.length === 0 ? (
          <EmptyLibrary />
        ) : (
          <div className="flex flex-col gap-5 pt-2">
            {groups.length === 0 ? (
              <p
                className={`px-2 text-center text-sm text-fg-muted ${deferredQuery ? 'py-4' : 'py-10'}`}
                role="status"
              >
                {deferredQuery ? (
                  scopeLabel === 'notes' ? (
                    <>No notes contain “{deferredQuery}”.</>
                  ) : (
                    <>
                      No {scopeLabel} contain “{deferredQuery}”.{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setFilter('all');
                          setTag(null);
                        }}
                        className="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                      >
                        Search all notes
                      </button>
                    </>
                  )
                ) : activeTag ? (
                  <>No notes tagged #{activeTag} here.</>
                ) : (
                  'Nothing here yet.'
                )}
              </p>
            ) : (
              <>
                {deferredQuery ? (
                  <p className="px-2 text-xs text-fg-muted" role="status">
                    {filtered.length} {filtered.length === 1 ? 'exact match' : 'exact matches'}
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
              </>
            )}
            {deferredQuery ? (
              <MeaningResults
                query={deferredQuery}
                keywordIds={meaningExclude}
                compact={variant === 'sidebar'}
              />
            ) : null}
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
  const rowRef = useRef<HTMLLIElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [renaming, setRenaming] = useState(false);
  const text = snippet(note.plainText, query, compact ? 110 : 160);
  const title = note.title || 'Untitled note';
  const rowClass = `block rounded-md px-3 py-3 pr-20 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${active ? 'bg-accent-soft' : compact ? 'hover:bg-surface-2' : 'border border-border bg-surface shadow-sm hover:border-control'}`;

  function togglePin() {
    void setPinned(note.id, !note.pinned);
    toast.show({ message: note.pinned ? 'Unpinned' : 'Pinned to top', durationMs: 2500 });
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(note.plainText);
      toast.show({ tone: 'success', message: 'Copied to clipboard', durationMs: 2500 });
    } catch {
      toast.show({ tone: 'error', message: 'Could not copy. Open the note and copy from there.' });
    }
  }

  async function downloadAudio() {
    const audio = note.audioId ? await getAudio(note.audioId) : undefined;
    if (!audio) return;
    downloadBlob(fileNameFor(title, note.createdAt, extensionFor(audio.mimeType)), audio.blob);
  }

  async function remove() {
    const removed = await deleteNote(note.id);
    if (!removed) return;
    if (active) navigate('/');
    toast.show({
      message: `Deleted “${title}”`,
      actions: [{ label: 'Undo', onClick: () => void restoreNote(removed) }],
      durationMs: 7000,
    });
  }

  const items: MenuItem[] = [
    { label: 'Rename', icon: PencilSimpleIcon, onSelect: () => setRenaming(true), keepFocus: true },
    {
      label: note.pinned ? 'Unpin' : 'Pin to top',
      icon: note.pinned ? PushPinSlashIcon : PushPinIcon,
      onSelect: togglePin,
    },
    ...(note.plainText.trim()
      ? [{ label: 'Copy text', icon: CopyIcon, onSelect: () => void copyText() }]
      : []),
    ...(note.audioId
      ? [
          {
            label: 'Download audio',
            icon: DownloadSimpleIcon,
            onSelect: () => void downloadAudio(),
          },
        ]
      : []),
    {
      label: 'Delete',
      icon: TrashIcon,
      onSelect: () => void remove(),
      danger: true,
      separated: true,
    },
  ];

  const body = (
    <>
      <span className="flex items-baseline justify-between gap-3">
        {renaming ? (
          <RenameField
            initial={note.title}
            compact={compact}
            onDone={(next) => {
              setRenaming(false);
              if (next !== null && next !== note.title) void renameNote(note.id, next);
              requestAnimationFrame(() => linkRef.current?.focus());
            }}
          />
        ) : (
          <span
            className={`min-w-0 truncate font-semibold ${compact ? 'text-sm' : 'text-[0.95rem]'}`}
          >
            <Highlight text={title} query={query} />
          </span>
        )}
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
        {note.bookmarks.length > 0 ? (
          <span className="tabular inline-flex items-center gap-0.5">
            <BookmarkSimpleIcon aria-hidden="true" className="size-3.5" />
            {note.bookmarks.length}
            <span className="sr-only">
              {note.bookmarks.length === 1 ? ' bookmark' : ' bookmarks'}
            </span>
          </span>
        ) : null}
        {note.tags.slice(0, 3).map((t) => (
          <span key={t} className="max-w-28 truncate">
            #{t}
          </span>
        ))}
        {note.tags.length > 3 ? <span>+{note.tags.length - 3}</span> : null}
        <StatusBadge status={note.status} showReady={false} />
      </span>
    </>
  );

  return (
    <m.li
      ref={rowRef}
      layout="position"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, transition: { duration: 0.15 } }}
      className="group relative"
    >
      {renaming ? (
        // An input cannot live inside a link, so the row is a plain block while renaming.
        <div className={rowClass}>{body}</div>
      ) : (
        <a
          ref={linkRef}
          href={`#/note/${note.id}`}
          aria-current={active ? 'page' : undefined}
          className={rowClass}
        >
          {body}
        </a>
      )}
      <div className="absolute top-2 right-1.5 flex items-center">
        <IconButton
          icon={PushPinIcon}
          label={note.pinned ? 'Unpin note' : 'Pin note'}
          size="sm"
          active={note.pinned}
          aria-pressed={note.pinned}
          onClick={togglePin}
          className={
            note.pinned
              ? ''
              : 'opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100'
          }
        />
        <Menu
          items={items}
          contextTarget={rowRef}
          trigger={(props) => (
            <IconButton
              {...props}
              icon={DotsThreeIcon}
              label={`Actions for ${title}`}
              size="sm"
              className="opacity-100 aria-expanded:opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
            />
          )}
        />
      </div>
    </m.li>
  );
}

/** Inline title field for a library row. Enter or leaving saves; Escape cancels (null). */
function RenameField({
  initial,
  compact,
  onDone,
}: {
  initial: string;
  compact: boolean;
  onDone: (title: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);
  function finish(result: string | null) {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(result);
  }
  return (
    <input
      autoFocus
      value={value}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(value.trim() ? value : null);
        if (event.key === 'Escape') {
          event.stopPropagation();
          finish(null);
        }
      }}
      onBlur={() => finish(value.trim() ? value : null)}
      aria-label="Note title"
      maxLength={200}
      className={`-my-1 -ml-1.5 min-w-0 flex-1 rounded-sm border border-accent bg-surface px-1.5 py-0.5 font-semibold outline-none ring-3 ring-accent/15 ${compact ? 'text-base sm:text-sm' : 'text-base'}`}
    />
  );
}

export function NewTextNoteButton() {
  return (
    <button
      type="button"
      onClick={() => void createTextNote().then((id) => navigate(`/note/${id}`))}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
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
