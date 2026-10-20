import type { ReactNode } from 'react';

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-border bg-surface px-1.5 py-0.5 font-sans text-[0.7rem] font-medium text-fg-muted shadow-sm">
      {children}
    </kbd>
  );
}
