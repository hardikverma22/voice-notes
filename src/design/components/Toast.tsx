import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ToastContext, type ToastOptions } from './toastContext';

const DEFAULT_DURATION_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [paused, setPaused] = useState(false);

  const show = useCallback((options: ToastOptions) => {
    setPaused(false);
    setToast(options);
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast || paused) return;
    const duration = toast.durationMs ?? DEFAULT_DURATION_MS;
    if (duration === 0) return;
    const timer = window.setTimeout(dismiss, duration);
    return () => window.clearTimeout(timer);
  }, [toast, paused, dismiss]);

  useEffect(() => {
    if (!toast) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [toast, dismiss]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast ? (
        <div
          role="status"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md bg-fg px-4 py-3 text-sm text-bg shadow-md"
          style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.actions?.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                action.onClick();
                dismiss();
              }}
              className="min-h-11 rounded-md px-3 font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="min-h-11 min-w-11 rounded-md text-lg leading-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bg"
          >
            ×
          </button>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
