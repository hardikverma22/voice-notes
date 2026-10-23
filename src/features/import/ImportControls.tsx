import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { useToast } from '../../design/components/useToast';
import { UploadSimpleIcon } from '../../design/icons';

type Toast = ReturnType<typeof useToast>;

/** Imports files one after another; the import code loads on first use. */
async function importFiles(files: File[], toast: Toast): Promise<void> {
  if (files.length === 0) return;
  const { importAudioFile, isImportable } = await import('./importAudio');
  const usable = files.filter(isImportable);
  if (usable.length < files.length) {
    toast.show({
      tone: 'error',
      message:
        usable.length === 0
          ? 'Those are not audio or video files.'
          : `Skipped ${files.length - usable.length} file(s) that are not audio or video.`,
    });
  }
  let lastId: string | null = null;
  let imported = 0;
  for (const file of usable) {
    toast.show({ message: `Reading “${file.name}”…`, durationMs: 2500 });
    try {
      lastId = await importAudioFile(file);
      imported++;
    } catch (error) {
      toast.show({
        tone: 'error',
        message: error instanceof Error ? error.message : `“${file.name}” could not be imported.`,
      });
    }
  }
  if (imported === 0 || !lastId) return;
  const id = lastId;
  if (imported === 1) navigate(`/note/${id}`);
  toast.show({
    tone: 'success',
    message:
      imported === 1
        ? 'Imported. Transcribing on this device…'
        : `Imported ${imported} recordings. They are transcribed one by one.`,
    actions: imported === 1 ? [] : [{ label: 'Open last', onClick: () => navigate(`/note/${id}`) }],
  });
}

const ACCEPT = 'audio/*,video/*,.m4a,.mp3,.wav,.ogg,.opus,.webm,.flac,.mp4,.mov';

/** "Import" button with a hidden multi-file picker. */
export function ImportButton({ variant }: { variant: 'icon' | 'chip' }) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      multiple
      className="hidden"
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = '';
        void importFiles(files, toast);
      }}
    />
  );
  if (variant === 'icon') {
    return (
      <>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          aria-label="Import audio or video files"
          title="Import audio or video files"
          className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-fg-muted shadow-sm transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
        >
          <UploadSimpleIcon aria-hidden="true" className="size-4" />
        </button>
        {input}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <UploadSimpleIcon aria-hidden="true" className="size-4" />
        Import
      </button>
      {input}
    </>
  );
}

/** Drop audio or video files anywhere on the window to import them. */
export function DropToImport() {
  const toast = useToast();
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  useEffect(() => {
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current++;
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      void importFiles([...(event.dataTransfer?.files ?? [])], toast);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [toast]);

  return (
    <AnimatePresence>
      {dragging ? (
        <m.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-bg/80 p-6 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-accent bg-surface px-10 py-8 text-center shadow-lg">
            <UploadSimpleIcon aria-hidden="true" className="size-8 text-accent" />
            <p className="font-serif text-xl font-medium">Drop to transcribe</p>
            <p className="max-w-xs text-sm text-fg-muted">
              Audio or video files, up to an hour each. They are transcribed on this device.
            </p>
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
