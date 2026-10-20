import { useLiveQuery } from 'dexie-react-hooks';
import { formatDate, formatDuration } from '../../lib/format';
import { listNotes } from '../../storage/notes';

export function NotesList() {
  const notes = useLiveQuery(() => listNotes(), []);

  if (!notes) return null;
  if (notes.length === 0) {
    return <p className="text-fg-muted">No notes yet. Press Record or Space to start.</p>;
  }

  return (
    <ul aria-label="Notes" className="flex flex-col gap-3">
      {notes.map((note) => (
        <li key={note.id}>
          <a
            href={`#/note/${note.id}`}
            className="block rounded-md bg-surface p-4 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span className="block font-serif text-lg">{note.title}</span>
            <span className="mt-1 block text-xs text-fg-muted">
              {formatDate(note.createdAt)} · {formatDuration(note.durationMs)}
            </span>
            {note.plainText ? (
              <span className="mt-2 line-clamp-2 block text-sm text-fg-muted">
                {note.plainText}
              </span>
            ) : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
