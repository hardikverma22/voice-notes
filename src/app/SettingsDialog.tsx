import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../design/components/Button';
import { Dialog } from '../design/components/Dialog';
import { Kbd } from '../design/components/Kbd';
import { ProgressBar } from '../design/components/ProgressBar';
import { Segmented } from '../design/components/Segmented';
import { Select } from '../design/components/Select';
import { useToast } from '../design/components/useToast';
import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CloudArrowDownIcon,
  DesktopIcon,
  DownloadSimpleIcon,
  MoonIcon,
  SunIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from '../design/icons';
import { downloadBlob } from '../features/notes/exportNote';
import { ModelProgressCard, ModelReadyLine } from '../features/transcribe/ModelIndicator';
import { EMBED_MODEL_ID } from '../features/search/config';
import { ACCURATE_MODEL_ID, MODEL_ID } from '../features/transcribe/config';
import {
  deleteCachedModel,
  listCachedModels,
  type CachedModel,
} from '../features/transcribe/modelCache';
import {
  forgetAccurateDownload,
  loadAccurateModel,
  loadModel,
  useAccurateModel,
  useModel,
} from '../features/transcribe/modelStore';
import {
  LANGUAGES,
  needsAccurate,
  setTranscriptionSettings,
  useTranscriptionSettings,
  type Quality,
} from '../features/transcribe/settings';
import { useEmbedModel } from '../features/search/embedStore';
import { useIndexState } from '../features/search/indexer';
import { rebuildSearchIndex, turnOffSearch, turnOnSearch } from '../features/search/searchService';
import { formatBytes } from '../lib/format';
import { deleteAllNotes } from '../storage/notes';
import { navigate } from './router';
import { getTheme, setTheme, type Theme } from './theme';
import { useStorageEstimate } from './useStorageEstimate';

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Settings"
      description="Everything here stays on this device."
    >
      <div className="flex flex-col divide-y divide-border">
        <AppearanceSection />
        <TranscriptionSection />
        <SearchSection />
        <ModelsSection open={open} />
        <DataSection open={open} />
        <ShortcutsSection />
        {import.meta.env.DEV ? <DeveloperSection /> : null}
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 py-5 first:pt-2 last:pb-0">
      <h3 className="text-xs font-semibold tracking-wider text-fg-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function AppearanceSection() {
  const [theme, setCurrent] = useState<Theme>(() => getTheme());
  return (
    <Section title="Appearance">
      <Segmented<Theme>
        label="Theme"
        value={theme}
        onChange={(next) => {
          setTheme(next);
          setCurrent(next);
        }}
        options={[
          { value: 'system', label: 'System', icon: DesktopIcon },
          { value: 'light', label: 'Light', icon: SunIcon },
          { value: 'dark', label: 'Dark', icon: MoonIcon },
        ]}
      />
    </Section>
  );
}

function TranscriptionSection() {
  const model = useModel();
  const busy = useDownloadsBusy();
  return (
    <Section title="Transcription">
      <div className="flex flex-col gap-5">
        <LanguagePicker />
        <QualityPicker />

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium">Speech model</span>
          {model.status === 'idle' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 p-3">
              <p className="text-fg-muted">
                Not downloaded yet (about {model.approxDownloadMB} MB). It downloads automatically
                on your first recording.
              </p>
              <Button
                size="sm"
                variant="secondary"
                icon={CloudArrowDownIcon}
                onClick={loadModel}
                disabled={busy.accurate || busy.search}
              >
                Download now
              </Button>
              {busy.accurate || busy.search ? <OtherDownloadNote /> : null}
            </div>
          ) : null}
          {model.status === 'probing' ? (
            <p className="text-fg-muted">Checking this device…</p>
          ) : null}
          <ModelProgressCard context="settings" />
          <ModelReadyLine />
          {model.status === 'ready' && model.device === 'wasm' ? (
            <p className="text-xs text-fg-muted">
              This browser has no WebGPU, so transcription uses the CPU and is slower.
            </p>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

/**
 * Which model downloads are running. Only one runs at a time: the other download buttons stay
 * disabled until it finishes, because two large downloads at once stall and then fail.
 */
function useDownloadsBusy() {
  const speech = useModel();
  const accurate = useAccurateModel();
  const search = useEmbedModel();
  return {
    speech: speech.status === 'loading' || speech.status === 'probing',
    accurate: accurate.status === 'loading',
    search: search.status === 'loading' || search.status === 'probing',
  };
}

function OtherDownloadNote() {
  return (
    <p className="text-xs text-fg-muted" role="status">
      Another model is downloading. Wait for it to finish, then try again.
    </p>
  );
}

function LanguagePicker() {
  const { language, quality } = useTranscriptionSettings();
  const acc = useAccurateModel();
  const busy = useDownloadsBusy();
  const languageName = LANGUAGES.find((l) => l.value === language)?.label ?? language;
  const accurateOn = quality === 'accurate' && acc.status !== 'unsupported';
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label htmlFor="vn-language" className="font-medium">
        Language you speak
      </label>
      <Select
        id="vn-language"
        value={language}
        onChange={(next) => setTranscriptionSettings({ language: next })}
        options={LANGUAGES}
      />
      {!needsAccurate(language) ? (
        <p className="text-xs text-fg-muted text-pretty">
          Notes are written in the language you pick here.
        </p>
      ) : accurateOn ? (
        <p className="text-xs text-fg-muted text-pretty">
          {languageName} uses the Accurate model. Expect some spelling mistakes; English is still
          the most reliable.
        </p>
      ) : (
        <div className="mt-1 flex items-start gap-2.5 rounded-md bg-surface-2 p-3 text-xs">
          <WarningCircleIcon
            aria-hidden="true"
            weight="fill"
            className="mt-px size-4 shrink-0 text-danger"
          />
          <div className="flex flex-col gap-2">
            <p className="text-pretty">
              {acc.status === 'unsupported'
                ? `${languageName} needs the Accurate model, which this device cannot run. Transcripts will be mostly wrong.`
                : `${languageName} needs the Accurate model. With Fast, transcripts are mostly wrong.`}
            </p>
            {acc.status !== 'unsupported' ? (
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy.speech || busy.search}
                  onClick={() => setTranscriptionSettings({ quality: 'accurate' })}
                >
                  Use Accurate
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function QualityPicker() {
  const { quality } = useTranscriptionSettings();
  const acc = useAccurateModel();
  const busy = useDownloadsBusy();
  if (acc.status === 'checking') return null;
  if (acc.status === 'unsupported') {
    return (
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Quality</span>
        <p className="text-xs text-fg-muted text-pretty">
          Fast. The Accurate option needs a graphics chip with half-precision support (recent Chrome
          or Edge on most laptops), which this device does not have.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <span className="font-medium" id="vn-quality-label">
        Quality
      </span>
      <Segmented<Quality>
        label="Transcription quality"
        value={quality}
        onChange={(next) => setTranscriptionSettings({ quality: next })}
        options={[
          { value: 'fast', label: 'Fast' },
          { value: 'accurate', label: 'Accurate' },
        ]}
      />
      <p className="text-xs text-fg-muted text-pretty">
        {quality === 'fast'
          ? `Fast uses the small model for everything. Accurate adds a larger model (about ${acc.approxDownloadMB} MB, downloaded once) that writes the final transcript after you stop; live text while you speak stays fast.`
          : 'The larger model writes the final transcript after you stop, which takes a little longer. Use Transcribe again on older notes to redo them.'}
      </p>
      {quality === 'accurate' && acc.status === 'loading' ? (
        <div className="flex flex-col gap-1.5">
          <ProgressBar value={acc.percent} label="Accurate model download" />
          <p className="tabular text-xs text-fg-muted" role="status">
            {acc.cached ? 'Loading…' : `Downloading… ${Math.round(acc.percent)}%`}
          </p>
        </div>
      ) : quality === 'accurate' && acc.status === 'ready' ? (
        <p className="flex items-center gap-2 text-sm text-success" role="status">
          <CheckCircleIcon aria-hidden="true" weight="fill" className="size-4.5" />
          Accurate model ready
        </p>
      ) : quality === 'accurate' && acc.status === 'idle' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-fg-muted">
            Not downloaded yet (about {acc.approxDownloadMB} MB). Until you download it, final
            transcripts use the Fast model.
          </p>
          <Button
            size="sm"
            variant="secondary"
            icon={CloudArrowDownIcon}
            onClick={loadAccurateModel}
            disabled={busy.speech || busy.search}
          >
            Download now
          </Button>
          {busy.speech || busy.search ? <OtherDownloadNote /> : null}
        </div>
      ) : quality === 'accurate' && acc.status === 'error' ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-danger">
            The Accurate model could not load; the fast one is used meanwhile.
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={loadAccurateModel}
            disabled={busy.speech || busy.search}
          >
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function SearchSection() {
  const model = useEmbedModel();
  const index = useIndexState();
  const busy = useDownloadsBusy();
  return (
    <Section title="Search by meaning">
      <p className="text-sm text-fg-muted text-pretty">
        Finds notes that say something in other words, not only exact matches, and suggests related
        notes. A small model (about {model.approxDownloadMB} MB) runs on this device; nothing is
        uploaded.
      </p>
      {model.status === 'off' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="secondary"
            icon={CloudArrowDownIcon}
            onClick={turnOnSearch}
            disabled={busy.speech || busy.accurate}
          >
            Turn on
          </Button>
          {busy.speech || busy.accurate ? <OtherDownloadNote /> : null}
        </div>
      ) : model.status === 'loading' || model.status === 'probing' ? (
        <div className="flex flex-col gap-2 text-xs text-fg-muted">
          <ProgressBar value={model.percent} label="Search model download" />
          <p className="tabular" role="status">
            {model.cached ? 'Loading…' : `Downloading… ${Math.round(model.percent)}%`}
          </p>
        </div>
      ) : model.status === 'error' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-danger">The search model could not load.</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={turnOnSearch}
            disabled={busy.speech || busy.accurate}
          >
            Try again
          </Button>
          {busy.speech || busy.accurate ? <OtherDownloadNote /> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="tabular text-sm" role="status">
            {index.running
              ? `Indexing ${index.indexed} of ${index.total} notes…`
              : `On. ${index.indexed} ${index.indexed === 1 ? 'note' : 'notes'} indexed.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={ArrowsClockwiseIcon}
              onClick={() => void rebuildSearchIndex()}
              disabled={index.running}
            >
              Rebuild index
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void turnOffSearch()}>
              Turn off
            </Button>
          </div>
          <p className="text-xs text-fg-muted">Turning it off also deletes the search index.</p>
        </div>
      )}
    </Section>
  );
}

/** Changes whenever a model starts, finishes or fails, so the sizes shown here are re-read. */
function useDownloadStatusKey(): string {
  const speech = useModel().status;
  const accurate = useAccurateModel().status;
  const search = useEmbedModel().status;
  return `${speech}|${accurate}|${search}`;
}

function ModelsSection({ open }: { open: boolean }) {
  const toast = useToast();
  const [models, setModels] = useState<CachedModel[] | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const downloadKey = useDownloadStatusKey();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listCachedModels()
      .then((list) => {
        if (!cancelled) setModels(list);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, version, downloadKey]);

  async function remove(model: CachedModel) {
    await deleteCachedModel(model.id);
    if (model.id === ACCURATE_MODEL_ID) {
      setTranscriptionSettings({ quality: 'fast' });
      forgetAccurateDownload();
    } else if (model.id === EMBED_MODEL_ID) {
      await turnOffSearch();
    }
    setConfirmId(null);
    setVersion((v) => v + 1);
    toast.show({
      message:
        model.id === MODEL_ID
          ? `Removed ${model.name}. It downloads again on your next recording.`
          : `Removed ${model.name} (${formatBytes(model.bytes)})`,
    });
  }

  if (!models || models.length === 0) return null;
  return (
    <Section title="Downloaded models">
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {models.map((model) => (
          <li key={model.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{model.name}</p>
              <p className="truncate text-xs text-fg-muted">{model.purpose}</p>
            </div>
            <span className="tabular shrink-0 text-xs text-fg-muted">
              {formatBytes(model.bytes)}
            </span>
            {model.removable ? (
              <Button
                size="sm"
                variant={confirmId === model.id ? 'danger' : 'ghost'}
                onBlur={() => setConfirmId((id) => (id === model.id ? null : id))}
                onClick={() =>
                  confirmId === model.id ? void remove(model) : setConfirmId(model.id)
                }
                aria-label={
                  confirmId === model.id ? `Confirm delete ${model.name}` : `Delete ${model.name}`
                }
              >
                {confirmId === model.id ? 'Confirm' : 'Delete'}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted text-pretty">
        Models are stored by your browser, not inside your notes. Deleting one frees the space; it
        downloads again when a feature needs it.
      </p>
    </Section>
  );
}

function DataSection({ open }: { open: boolean }) {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const downloadKey = useDownloadStatusKey();
  const estimate = useStorageEstimate(`${open}-${version}-${downloadKey}`);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function backup() {
    setBusy('export');
    try {
      const { exportZipBackup } = await import('../storage/backup');
      const { blob, notes, recordings } = await exportZipBackup();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(`voice-notes-backup-${stamp}.zip`, blob);
      toast.show({
        tone: 'success',
        message: `Backed up ${plural(notes, 'note')} and ${plural(recordings, 'recording')} (${formatBytes(blob.size)})`,
      });
    } catch (error) {
      console.error('Backup failed', error);
      toast.show({
        tone: 'error',
        message: 'The backup could not be made. Free some space on this device and try again.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function restore(file: File) {
    setBusy('import');
    try {
      const { importAnyBackup } = await import('../storage/backup');
      const { notes, recordings } = await importAnyBackup(file);
      toast.show({
        tone: 'success',
        message:
          notes === 0
            ? 'Nothing new to import. Those notes are already here.'
            : `Imported ${plural(notes, 'note')}${recordings ? ` with ${plural(recordings, 'recording')}` : ''}`,
      });
      setVersion((v) => v + 1);
    } catch (error) {
      toast.show({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Import failed',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="Your data">
      {estimate ? (
        <div className="flex flex-col gap-2">
          <ProgressBar
            value={(estimate.usage / Math.max(1, estimate.quota)) * 100}
            label="Storage used"
          />
          <p className="tabular text-xs text-fg-muted">
            Using {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} available (includes
            the speech model).
          </p>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          icon={DownloadSimpleIcon}
          onClick={() => void backup()}
          disabled={busy !== null}
          aria-busy={busy === 'export'}
        >
          {busy === 'export' ? 'Packing backup…' : 'Export backup'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={UploadSimpleIcon}
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
          aria-busy={busy === 'import'}
        >
          {busy === 'import' ? 'Importing…' : 'Import backup'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip,.json,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restore(file);
            event.target.value = '';
          }}
        />
      </div>
      <p className="text-xs text-fg-muted text-pretty">
        A backup is one .zip file with every note, tag, bookmark and recording. Importing skips
        notes that are already here. Older text-only .json backups still import.
      </p>
      <div>
        <Button
          size="sm"
          variant="danger"
          icon={TrashIcon}
          onBlur={() => setConfirmDelete(false)}
          onClick={() => {
            if (!confirmDelete) {
              setConfirmDelete(true);
              return;
            }
            void deleteAllNotes().then(() => {
              setConfirmDelete(false);
              setVersion((v) => v + 1);
              navigate('/');
              toast.show({ message: 'All notes deleted' });
            });
          }}
        >
          {confirmDelete ? 'Click again to delete everything' : 'Delete all notes'}
        </Button>
      </div>
    </Section>
  );
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** Dev builds only: sample notes to try search and the library with. */
function DeveloperSection() {
  const toast = useToast();
  async function add() {
    const { addDemoNotes } = await import('../dev/demoNotes');
    const count = await addDemoNotes();
    toast.show({
      tone: 'success',
      message: `Added ${count} demo notes. Try searching “teeth check-up” or “injury while jogging”.`,
      durationMs: 6000,
    });
  }
  async function remove() {
    const { removeDemoNotes } = await import('../dev/demoNotes');
    const count = await removeDemoNotes();
    toast.show({ message: `Removed ${plural(count, 'demo note')}` });
  }
  return (
    <Section title="Developer">
      <p className="text-sm text-fg-muted">
        Shown in development only. Demo notes are tagged #demo and can be removed here.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void add()}>
          Add demo notes
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void remove()}>
          Remove demo notes
        </Button>
      </div>
    </Section>
  );
}

function ShortcutsSection() {
  const rows: [ReactNode, string][] = [
    [<Kbd key="s">Space</Kbd>, 'Start or stop recording (home)'],
    [<Kbd key="m">M</Kbd>, 'Mark a moment while recording'],
    [
      <span key="k" className="inline-flex gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>,
      'Search notes',
    ],
    [
      <span key="b" className="inline-flex gap-1">
        <Kbd>⌘</Kbd>
        <Kbd>B</Kbd> <Kbd>I</Kbd> <Kbd>U</Kbd>
      </span>,
      'Bold, italic, underline',
    ],
    [<Kbd key="e">Esc</Kbd>, 'Close dialogs and menus'],
  ];
  return (
    <Section title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2.5 text-sm">
        {rows.map(([keys, label]) => (
          <div key={label} className="contents">
            <dt>{keys}</dt>
            <dd className="text-fg-muted">{label}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
