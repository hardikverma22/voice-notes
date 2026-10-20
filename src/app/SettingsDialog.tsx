import { useRef, useState, type ReactNode } from 'react';
import { Button } from '../design/components/Button';
import { Dialog } from '../design/components/Dialog';
import { Kbd } from '../design/components/Kbd';
import { ProgressBar } from '../design/components/ProgressBar';
import { Segmented } from '../design/components/Segmented';
import { useToast } from '../design/components/useToast';
import {
  CloudArrowDownIcon,
  DesktopIcon,
  DownloadSimpleIcon,
  MoonIcon,
  SunIcon,
  TrashIcon,
  UploadSimpleIcon,
} from '../design/icons';
import { downloadText } from '../features/notes/exportNote';
import { ModelProgressCard, ModelReadyLine } from '../features/transcribe/ModelIndicator';
import { loadModel, useModel } from '../features/transcribe/modelStore';
import { formatBytes } from '../lib/format';
import { deleteAllNotes, exportBackup, importBackup } from '../storage/notes';
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
        <DataSection open={open} />
        <ShortcutsSection />
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
  return (
    <Section title="Transcription">
      <p className="text-sm text-fg-muted">
        Transcription is tuned for English speech. Support for other languages needs a larger model
        and is planned.
      </p>

      <div className="flex flex-col gap-2 text-sm">
        <span className="font-medium">Speech model</span>
        {model.status === 'idle' ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface-2 p-3">
            <p className="text-fg-muted">
              Not downloaded yet (about {model.approxDownloadMB} MB). It downloads automatically on
              your first recording.
            </p>
            <Button size="sm" variant="secondary" icon={CloudArrowDownIcon} onClick={loadModel}>
              Download now
            </Button>
          </div>
        ) : null}
        {model.status === 'probing' ? <p className="text-fg-muted">Checking this device…</p> : null}
        <ModelProgressCard context="settings" />
        <ModelReadyLine />
        {model.status === 'ready' && model.device === 'wasm' ? (
          <p className="text-xs text-fg-muted">
            This browser has no WebGPU, so transcription uses the CPU and is slower.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

function DataSection({ open }: { open: boolean }) {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const estimate = useStorageEstimate(`${open}-${version}`);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function backup() {
    const json = await exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`voice-notes-backup-${stamp}.json`, json, 'application/json');
  }

  async function restore(file: File) {
    try {
      const added = await importBackup(await file.text());
      toast.show({
        tone: 'success',
        message: `Imported ${added} ${added === 1 ? 'note' : 'notes'}`,
      });
      setVersion((v) => v + 1);
    } catch (error) {
      toast.show({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Import failed',
      });
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
        >
          Export backup
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={UploadSimpleIcon}
          onClick={() => fileRef.current?.click()}
        >
          Import backup
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void restore(file);
            event.target.value = '';
          }}
        />
      </div>
      <p className="text-xs text-fg-muted">Backups contain text only, not audio.</p>
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

function ShortcutsSection() {
  const rows: [ReactNode, string][] = [
    [<Kbd key="s">Space</Kbd>, 'Start or stop recording (home)'],
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
