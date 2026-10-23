import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, m } from 'motion/react';
import { noteHref } from '../../app/router';
import { db } from '../../storage/db';
import { listTime } from '../notes/groupNotes';
import { useEmbedModel } from './embedStore';
import { useRelatedNotes } from './searchService';

/** Notes close in meaning to this one, found on this device. Hidden when there are none. */
export function RelatedNotes({ noteId }: { noteId: string }) {
  const model = useEmbedModel();
  const related = useRelatedNotes(noteId, model.status === 'ready');
  const ids = related.map((r) => r.noteId);
  const notes = useLiveQuery(
    async () => (await db.notes.bulkGet(ids)).filter((n) => n !== undefined),
    [ids.join(',')],
  );
  const shown = notes ?? [];

  return (
    <AnimatePresence>
      {shown.length > 0 ? (
        <m.section
          aria-labelledby="related-heading"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mt-12 border-t border-border pt-6"
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 px-1">
            <h2 id="related-heading" className="font-serif text-lg font-medium">
              Related notes
            </h2>
            <p className="text-xs text-fg-muted">Close in meaning, found on this device</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {shown.map((note) => (
              <li key={note.id}>
                <a
                  href={noteHref(note.id)}
                  className="group flex h-full flex-col gap-1 rounded-md border border-border bg-surface p-3 shadow-sm transition-colors hover:border-control focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold">
                      {note.title || 'Untitled note'}
                    </span>
                    <span className="tabular shrink-0 text-xs text-fg-muted">
                      {listTime(note.createdAt)}
                    </span>
                  </span>
                  <span className="line-clamp-2 text-[0.8rem] leading-snug text-fg-muted">
                    {note.plainText || 'No text'}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </m.section>
      ) : null}
    </AnimatePresence>
  );
}
