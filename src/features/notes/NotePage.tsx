import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, m } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { navigate } from '../../app/router';
import { Button, IconButton } from '../../design/components/Button';
import { Menu } from '../../design/components/Menu';
import { useToast } from '../../design/components/useToast';
import {
  ArrowLeftIcon,
  ArrowsClockwiseIcon,
  CheckIcon,
  CopyIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  PushPinIcon,
  ShareNetworkIcon,
  TrashIcon,
  WarningCircleIcon,
  WaveformIcon,
} from '../../design/icons';
import { formatDuration } from '../../lib/format';
import { getAudio } from '../../storage/audio';
import type { AudioRecord, Note } from '../../storage/db';
import { deleteNote, getNote, restoreNote, setPinned } from '../../storage/notes';
import { extensionFor } from '../recorder/mime';
import { ModelProgressCard } from '../transcribe/ModelIndicator';
import { enqueueTranscription } from '../transcribe/transcriptionQueue';
import { AudioPlayer } from './AudioPlayer';
import { downloadBlob, downloadText, fileNameFor } from './exportNote';
import NoteEditor, { type SaveStatus } from './NoteEditor';
import { StatusBadge } from './StatusBadge';
import { TranscriptView } from './TranscriptView';
import { useAudioPlayer } from './useAudioPlayer';

type Tab = 'note' | 'transcript';

export default function NotePage({ id }: { id: string }) {
  const note = useLiveQuery(() => getNote(id), [id]);
  if (note === undefined) return <NoteSkeleton />;
  if (note === null || !note) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <p className="font-serif text-2xl">This note no longer exists.</p>
        <Button variant="secondary" icon={ArrowLeftIcon} onClick={() => navigate('/')}>
          Back to notes
        </Button>
      </div>
    );
  }
  return <NoteView note={note} />;
}

function NoteView({ note }: { note: Note }) {
  const toast = useToast();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [tab, setTab] = useState<Tab>('note');
  const [audio, setAudio] = useState<AudioRecord | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  const audioId = note.audioId;
  useEffect(() => {
    if (!audioId) return;
    let url: string | null = null;
    let cancelled = false;
    void getAudio(audioId).then((record) => {
      if (!record || cancelled) return;
      url = URL.createObjectURL(record.blob);
      setAudio(record);
      setClipUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setClipUrl(null);
      setAudio(null);
    };
  }, [audioId]);

  const player = useAudioPlayer(clipUrl, note.durationMs / 1000);
  const locked = note.status === 'queued' || note.status === 'transcribing';
  const hasTimestamps = note.segments.some((segment) => segment.text.trim());
  const onEditor = useCallback((value: Editor | null) => setEditor(value), []);

  const plainText = () => editor?.getText() ?? note.plainText;
  const words = (editor?.getText() ?? note.plainText).split(/\s+/).filter(Boolean).length;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(plainText());
      toast.show({ tone: 'success', message: 'Copied to clipboard', durationMs: 2500 });
    } catch {
      toast.show({
        tone: 'error',
        message: 'Could not copy. Select the text and copy it instead.',
      });
    }
  }

  async function share() {
    const data = { title: note.title || 'Voice note', text: plainText() };
    if (navigator.share) {
      try {
        await navigator.share(data);
      } catch {
        // Cancelled by the user.
      }
    } else {
      await copyText();
    }
  }

  function exportAs(ext: 'md' | 'txt') {
    const title = note.title || 'Untitled note';
    const body = ext === 'md' ? (editor?.getMarkdown() ?? note.plainText) : plainText();
    const text = ext === 'md' ? `# ${title}\n\n${body}\n` : `${title}\n\n${body}\n`;
    downloadText(
      fileNameFor(title, note.createdAt, ext),
      text,
      `${ext === 'md' ? 'text/markdown' : 'text/plain'};charset=utf-8`,
    );
  }

  function downloadAudio() {
    if (!audio) return;
    downloadBlob(fileNameFor(note.title, note.createdAt, extensionFor(audio.mimeType)), audio.blob);
  }

  function retranscribe() {
    enqueueTranscription(note.id);
    toast.show({ message: 'Transcribing again…', durationMs: 2500 });
  }

  async function handleDelete() {
    const removed = await deleteNote(note.id);
    navigate('/');
    if (!removed) return;
    toast.show({
      message: 'Note deleted',
      actions: [{ label: 'Undo', onClick: () => void restoreNote(removed) }],
      durationMs: 7000,
    });
  }

  const menuItems = [
    { label: 'Share', icon: ShareNetworkIcon, onSelect: () => void share() },
    { label: 'Export as Markdown', icon: FileTextIcon, onSelect: () => exportAs('md') },
    { label: 'Export as plain text', icon: FileTextIcon, onSelect: () => exportAs('txt') },
    ...(audio
      ? [{ label: 'Download audio', icon: DownloadSimpleIcon, onSelect: downloadAudio }]
      : []),
    ...(audio && !locked
      ? [
          {
            label: 'Transcribe again',
            icon: ArrowsClockwiseIcon,
            onSelect: retranscribe,
            separated: true,
          },
        ]
      : []),
    {
      label: 'Delete note',
      icon: TrashIcon,
      onSelect: () => void handleDelete(),
      danger: true,
      separated: true,
    },
  ];

  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(
    note.createdAt,
  );

  return (
    <article className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-8">
      <h1 className="sr-only">{note.title || 'Untitled note'}</h1>

      <div className="flex items-center justify-between gap-2 py-3">
        <div className="flex items-center gap-1">
          <a
            href="#/"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full pr-3 pl-2 text-sm font-medium text-fg-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus lg:hidden"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-4" />
            Notes
          </a>
          <SaveIndicator status={saveStatus} />
        </div>
        <div className="flex items-center gap-0.5">
          <IconButton
            icon={PushPinIcon}
            label={note.pinned ? 'Unpin note' : 'Pin note'}
            active={note.pinned}
            aria-pressed={note.pinned}
            onClick={() => void setPinned(note.id, !note.pinned)}
          />
          <IconButton icon={CopyIcon} label="Copy text" onClick={() => void copyText()} />
          <Menu
            items={menuItems}
            trigger={(props) => <IconButton {...props} icon={DotsThreeIcon} label="More actions" />}
          />
        </div>
      </div>

      <NoteEditor
        key={`${note.id}:${locked ? 'locked' : 'edit'}`}
        note={note}
        locked={locked}
        onEditor={onEditor}
        onSaveStatus={setSaveStatus}
        hidden={tab !== 'note'}
        afterTitle={
          <div className="mt-3 flex flex-col gap-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
              <span>{date}</span>
              {note.durationMs > 0 ? (
                <span className="tabular inline-flex items-center gap-1">
                  <WaveformIcon aria-hidden="true" className="size-4" />
                  {formatDuration(note.durationMs)}
                </span>
              ) : null}
              <span className="tabular">
                {words} {words === 1 ? 'word' : 'words'} · {Math.max(1, Math.round(words / 220))}{' '}
                min read
              </span>
              <StatusBadge status={note.status} showReady={false} />
            </p>

            <StatusPanel note={note} onRetry={retranscribe} />

            {audio && clipUrl ? (
              <AudioPlayer
                player={player}
                blob={audio.blob}
                cacheKey={audio.id}
                onDownload={downloadAudio}
              />
            ) : null}

            {hasTimestamps ? (
              <div role="tablist" aria-label="View" className="flex gap-1 border-b border-border">
                {(['note', 'transcript'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={tab === value}
                    onClick={() => setTab(value)}
                    className="relative min-h-11 px-3 text-sm font-medium text-fg-muted aria-selected:text-fg focus-visible:outline-2 focus-visible:outline-focus"
                  >
                    {value === 'note' ? 'Note' : 'Timestamps'}
                    {tab === value ? (
                      <m.span
                        layoutId="note-tab"
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent"
                      />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {tab === 'transcript' ? (
              <TranscriptView segments={note.segments} player={clipUrl ? player : null} />
            ) : null}
          </div>
        }
      />
    </article>
  );
}

function StatusPanel({ note, onRetry }: { note: Note; onRetry: () => void }) {
  if (note.status === 'ready') return null;
  if (note.status === 'failed') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm shadow-sm">
        <WarningCircleIcon
          aria-hidden="true"
          weight="fill"
          className="mt-0.5 size-5 shrink-0 text-danger"
        />
        <div className="flex-1">
          <p className="font-medium">Transcription failed</p>
          <p className="mt-0.5 text-fg-muted">
            The audio is saved. You can try again, or type the note yourself.
          </p>
        </div>
        {note.audioId ? (
          <Button size="sm" variant="secondary" icon={ArrowsClockwiseIcon} onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-md bg-accent-soft p-4 text-sm text-fg">
        <m.span
          aria-hidden="true"
          className="size-4 shrink-0 rounded-full border-2 border-accent border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <p>
          <span className="font-medium">
            {note.status === 'queued' ? 'Waiting to transcribe.' : 'Writing the final transcript…'}
          </span>{' '}
          <span className="text-fg-muted">
            The note is saved; editing unlocks when it finishes.
          </span>
        </p>
      </div>
      <ModelProgressCard context="settings" />
    </div>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex min-h-10 items-center px-2 text-xs whitespace-nowrap text-fg-muted"
    >
      <AnimatePresence mode="wait" initial={false}>
        {status === 'saving' ? (
          <m.span
            key="saving"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5"
          >
            <span className="size-1.5 animate-pulse rounded-full bg-fg-muted" />
            Saving…
          </m.span>
        ) : status === 'error' ? (
          <m.span
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-danger"
          >
            Could not save. Keep typing to retry.
          </m.span>
        ) : (
          <m.span
            key="saved"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="inline-flex items-center gap-1.5"
          >
            <CheckIcon aria-hidden="true" weight="bold" className="size-3.5 text-success" />
            Saved<span className="hidden sm:inline"> on this device</span>
          </m.span>
        )}
      </AnimatePresence>
    </p>
  );
}

function NoteSkeleton() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 pt-16 sm:px-8" aria-hidden="true">
      <div className="vn-shimmer h-10 w-2/3 rounded-md" />
      <div className="vn-shimmer h-4 w-1/3 rounded-full" />
      <div className="vn-shimmer mt-4 h-24 rounded-lg" />
      <div className="vn-shimmer h-40 rounded-lg" />
    </div>
  );
}
