import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircleIcon, WarningCircleIcon, XIcon } from '../icons';
import { ToastContext, type ToastOptions } from './toastContext';

const DEFAULT_DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { key: number }) | null>(null);
  const [paused, setPaused] = useState(false);
  const keyRef = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    setPaused(false);
    keyRef.current += 1;
    setToast({ ...options, key: keyRef.current });
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

  const ToneIcon =
    toast?.tone === 'success'
      ? CheckCircleIcon
      : toast?.tone === 'error'
        ? WarningCircleIcon
        : null;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 z-[60] flex justify-center"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <AnimatePresence mode="popLayout">
          {toast ? (
            <m.div
              key={toast.key}
              initial={{ opacity: 0, y: 24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.15 } }}
              onMouseEnter={() => setPaused(true)}
              onMouseLeave={() => setPaused(false)}
              onFocus={() => setPaused(true)}
              onBlur={() => setPaused(false)}
              className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full bg-fg py-1.5 pr-1.5 pl-4 text-sm text-bg shadow-lg"
            >
              {ToneIcon ? (
                <ToneIcon aria-hidden="true" weight="fill" className="size-5 shrink-0" />
              ) : null}
              <span className="flex-1 py-2">{toast.message}</span>
              {toast.actions?.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    action.onClick();
                    dismiss();
                  }}
                  className="min-h-9 rounded-full px-3 font-semibold hover:bg-bg/15 focus-visible:outline-2 focus-visible:outline-bg"
                >
                  {action.label}
                </button>
              ))}
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="inline-flex size-9 items-center justify-center rounded-full hover:bg-bg/15 focus-visible:outline-2 focus-visible:outline-bg"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </m.div>
          ) : null}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
