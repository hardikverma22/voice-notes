import type { ReactNode } from 'react';
import { StorageUsage } from './StorageUsage';
import { ThemeToggle } from './ThemeToggle';
import { useOnline } from './useOnline';

export function Layout({ children }: { children: ReactNode }) {
  const online = useOnline();
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-serif text-lg">Voice Notes</span>
          {!online ? (
            <span
              role="status"
              className="rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted"
            >
              Offline
            </span>
          ) : null}
        </div>
        <ThemeToggle />
      </header>
      <main id="main" className="mx-auto max-w-2xl px-4 pb-12 pt-6">
        {children}
      </main>
      <footer className="mx-auto max-w-2xl px-4 pb-8">
        <StorageUsage />
      </footer>
    </div>
  );
}
