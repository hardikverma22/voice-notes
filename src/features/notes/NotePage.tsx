import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '../../design/components/Button';
import { useToast } from '../../design/components/useToast';
import { formatDate, formatDuration } from '../../lib/format';
import { navigate } from '../../app/router';
import { getAudio } from '../../storage/audio';
import { deleteNote, getNote, restoreNote } from '../../storage/notes';
import NoteEditor from './NoteEditor';

export default function NotePage({ id }: { id: string }) {
  const toast = useToast();
  const note = useLiveQuery(() => getNote(id), [id]);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  const audioId = note?.audioId ?? null;
  useEffect(() => {
    if (!audioId) return;
    let url: string | null = null;
    let cancelled = false;
    void getAudio(audioId).then((record) => {
      if (!record || cancelled) return;
      url = URL.createObjectURL(record.blob);
      setClipUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setClipUrl(null);
    };
  }, [audioId]);

  if (note === undefined) return null;
  if (note === null) {
    return (
      <div className="flex flex-col gap-4">
        <p>This note no longer exists.</p>
        <a href="#/" className="text-accent underline">
          Back to notes
        </a>
      </div>
    );
  }

  async function handleDelete() {
    if (!note) return;
    const removed = await deleteNote(note.id);
    navigate('/');
    if (!removed) return;
    toast.show({
      message: 'Note deleted',
      actions: [{ label: 'Undo', onClick: () => void restoreNote(removed) }],
      durationMs: 6000,
    });
  }

  return (
    <article className="flex flex-col gap-4">
      <a href="#/" className="inline-flex min-h-11 items-center text-sm text-fg-muted underline">
        All notes
      </a>
      <h1 className="sr-only">{note.title}</h1>
      <p className="text-sm text-fg-muted">
        {formatDate(note.createdAt)} · {formatDuration(note.durationMs)}
      </p>
      {clipUrl ? <audio controls src={clipUrl} className="w-full" aria-label="Recording" /> : null}
      <section aria-label="Transcript">
        <NoteEditor key={note.id} note={note} />
      </section>
      <div>
        <Button variant="danger" onClick={() => void handleDelete()}>
          Delete
        </Button>
      </div>
    </article>
  );
}
