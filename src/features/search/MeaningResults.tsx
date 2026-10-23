import { useLiveQuery } from 'dexie-react-hooks';
import { m } from 'motion/react';
import { noteHref } from '../../app/router';
import { Button } from '../../design/components/Button';
import { ProgressBar } from '../../design/components/ProgressBar';
import { ArrowsClockwiseIcon, MagnifyingGlassIcon, PlayIcon } from '../../design/icons';
import { formatDuration } from '../../lib/format';
import { db } from '../../storage/db';
import { useEmbedModel } from './embedStore';
import { useIndexState } from './indexer';
import { turnOnSearch, useMeaningSearch } from './searchService';

/**
 * The "Similar meaning" part of library search: notes that say it differently, below the exact
 * keyword matches. Offers to turn the feature on when it is off.
 */
export function MeaningResults({
  query,
  keywordIds,
  compact,
}: {
  query: string;
  /** Notes not to show: exact matches, and notes hidden by the library filters. */
  keywordIds: string[];
  compact: boolean;
}) {
  const model = useEmbedModel();
  const index = useIndexState();
  const search = useMeaningSearch(query, keywordIds, model.status === 'ready');
  const results = search.status === 'done' ? search.results : [];
  const ids = results.map((r) => r.noteId);
  const notes = useLiveQuery(
    async () => new Map((await db.notes.bulkGet(ids)).flatMap((n) => (n ? [[n.id, n]] : []))),
    [ids.join(',')],
  );

  if (query.trim().length < 3) return null;

  if (model.status === 'off') {
    return (
      <div className="mx-1 mt-2 flex flex-col gap-2 rounded-md border border-dashed border-border p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <MagnifyingGlassIcon aria-hidden="true" className="size-4 text-accent" />
          Search by meaning
        </p>
        <p className="text-fg-muted text-pretty">
          Also find notes that say it in other words. Downloads a {model.approxDownloadMB} MB model
          once; your notes never leave this device.
        </p>
        <div>
          <Button size="sm" variant="soft" onClick={turnOnSearch}>
            Turn on
          </Button>
        </div>
      </div>
    );
  }

  if (model.status === 'loading' || model.status === 'probing') {
    return (
      <div className="mx-1 mt-2 flex flex-col gap-2 rounded-md bg-surface-2 p-3 text-xs text-fg-muted">
        <p role="status">
          {model.cached
            ? 'Loading search…'
            : `Downloading search model… ${Math.round(model.percent)}%`}
        </p>
        <ProgressBar value={model.percent} label="Search model download" />
      </div>
    );
  }

  if (model.status === 'error') {
    return (
      <div className="mx-1 mt-2 flex items-center justify-between gap-3 rounded-md bg-surface-2 p-3 text-xs">
        <p className="text-fg-muted">Search by meaning could not start.</p>
        <Button size="sm" variant="secondary" icon={ArrowsClockwiseIcon} onClick={turnOnSearch}>
          Try again
        </Button>
      </div>
    );
  }

  const indexing = index.running && index.indexed < index.total;
  return (
    <section aria-label="Similar meaning" className="flex flex-col gap-1.5">
      <h3 className="flex items-center justify-between gap-2 px-2 text-[0.7rem] font-semibold tracking-wider text-fg-muted uppercase">
        Similar meaning
        {indexing ? (
          <span className="tabular font-normal tracking-normal normal-case">
            Indexing {index.indexed} of {index.total}…
          </span>
        ) : search.status === 'searching' ? (
          <span className="font-normal tracking-normal normal-case">Searching…</span>
        ) : null}
      </h3>
      {search.status === 'done' && results.length === 0 ? (
        <p className="px-2 py-2 text-xs text-fg-muted" role="status">
          Nothing else close in meaning.
        </p>
      ) : null}
      {/* One fade per result set: items are replaced, not animated one by one. */}
      <m.ul
        key={ids.join(',')}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1"
      >
        {results.map((result) => {
          const note = notes?.get(result.noteId);
          if (!note) return null;
          return (
            <li key={result.noteId}>
              <a
                href={noteHref(note.id, result.start)}
                className={`block rounded-md px-3 py-2.5 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${compact ? 'hover:bg-surface-2' : 'border border-border bg-surface shadow-sm hover:border-control'}`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {note.title || 'Untitled note'}
                  </span>
                  {result.start !== null && note.audioId ? (
                    <span className="tabular inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] font-semibold text-accent">
                      <PlayIcon aria-hidden="true" weight="fill" className="size-2.5" />
                      {formatDuration(result.start * 1000)}
                      <span className="sr-only"> into the recording</span>
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 line-clamp-2 block text-[0.8rem] leading-snug text-fg-muted">
                  “{stripTitle(result.text, note.title)}”
                </span>
              </a>
            </li>
          );
        })}
      </m.ul>
    </section>
  );
}

/** The first passage starts with the title (for matching); do not show it twice. */
function stripTitle(text: string, title: string): string {
  const prefix = `${title.trim()}. `;
  return title.trim() && text.startsWith(prefix) ? text.slice(prefix.length) : text;
}
