import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { IconButton } from '../design/components/Button';
import { GearSixIcon, MicrophoneIcon, WifiSlashIcon } from '../design/icons';
import {
  FOCUS_SEARCH_EVENT,
  NewTextNoteButton,
  NotesLibrary,
} from '../features/notes/NotesLibrary';
import { DropToImport, ImportButton } from '../features/import/ImportControls';
import { TasksLink } from '../features/tasks/TasksLink';
import { ModelChip } from '../features/transcribe/ModelIndicator';
import { RecordingPill } from './RecordingPill';
import { navigate, type Route } from './router';
import { useOnline } from './useOnline';

// Loaded on first open to keep the start-up bundle small.
const SettingsDialog = lazy(() =>
  import('./SettingsDialog').then((mod) => ({ default: mod.SettingsDialog })),
);

function Brand() {
  return (
    <a
      href="#/"
      className="flex items-center gap-2.5 rounded-full pr-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span className="flex size-8 items-center justify-center rounded-full bg-accent text-accent-fg shadow-sm">
        <MicrophoneIcon aria-hidden="true" weight="fill" className="size-4" />
      </span>
      <span className="font-serif text-lg font-semibold tracking-tight whitespace-nowrap">
        Voice Notes
      </span>
    </a>
  );
}

function OfflineBadge() {
  const online = useOnline();
  if (online) return null;
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg-muted"
    >
      <WifiSlashIcon aria-hidden="true" className="size-3.5" />
      Offline
    </span>
  );
}

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // ⌘K / Ctrl+K and "/" focus search; on phones away from home, go home first.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      const isK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (!isK && !(event.key === '/' && !typing)) return;
      event.preventDefault();
      if (route.name !== 'home' && window.matchMedia('(max-width: 1023px)').matches) {
        navigate('/');
        window.setTimeout(() => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT)), 80);
      } else {
        window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [route.name]);

  // Move focus to the main region on route change, for screen readers.
  useEffect(() => {
    if (route.name !== 'home') document.getElementById('main')?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [route]);

  const openSettings = () => {
    setSettingsLoaded(true);
    setSettingsOpen(true);
  };

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <div className="lg:grid lg:grid-cols-[21rem_minmax(0,1fr)]">
        <aside
          aria-label="Notes"
          className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface/60 lg:flex"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-4">
            <Brand />
            <IconButton icon={GearSixIcon} label="Settings" size="sm" onClick={openSettings} />
          </div>
          <div className="flex flex-col gap-2 px-3 pb-3">
            <a
              href="#/"
              aria-current={route.name === 'home' ? 'page' : undefined}
              className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg shadow-sm transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              <MicrophoneIcon aria-hidden="true" weight="fill" className="size-4" />
              New recording
            </a>
            <div className="grid grid-cols-2 gap-2">
              <NewTextNoteButton />
              <ImportButton variant="chip" />
            </div>
          </div>
          <nav aria-label="Sections" className="px-3 pb-3">
            <TasksLink variant="nav" active={route.name === 'tasks'} />
          </nav>
          <NotesLibrary variant="sidebar" />
        </aside>

        <div className="flex min-h-dvh min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border/70 bg-bg/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-md lg:static lg:h-auto lg:border-0 lg:bg-transparent lg:px-6 lg:pt-[max(1rem,env(safe-area-inset-top))] lg:backdrop-blur-none">
            <div className="flex items-center gap-2 lg:invisible">
              <Brand />
            </div>
            <div className="flex items-center gap-2">
              <OfflineBadge />
              <ModelChip onClick={openSettings} />
              <span className="lg:hidden">
                <IconButton icon={GearSixIcon} label="Settings" onClick={openSettings} />
              </span>
            </div>
          </header>
          <main id="main" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
        </div>
      </div>

      <RecordingPill visible={route.name !== 'home'} />
      <DropToImport />
      {settingsLoaded ? (
        <Suspense fallback={null}>
          <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </Suspense>
      ) : null}
    </div>
  );
}
