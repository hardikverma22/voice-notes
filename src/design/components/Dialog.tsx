import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '../icons';
import { IconButton } from './Button';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Last input type, so focus moved by the dialog only shows a ring for keyboard users.
let lastInputWasPointer = false;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => (lastInputWasPointer = true), true);
  document.addEventListener('keydown', () => (lastInputWasPointer = false), true);
}

/** Modal dialog: bottom sheet on phones, centred card on larger screens. Traps focus. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>(FOCUSABLE)
        ?.focus({ focusVisible: !lastInputWasPointer } as FocusOptions);
    });
    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.({ focusVisible: !lastInputWasPointer } as FocusOptions);
    };
  }, [open]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const nodes = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <m.div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            onClick={onClose}
          />
          <m.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, transition: { duration: 0.16 } }}
            className="vn-scroll relative flex max-h-[88dvh] w-full flex-col overflow-y-auto rounded-t-lg border border-border bg-surface shadow-lg sm:max-w-lg sm:rounded-lg"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-surface px-6 pt-5 pb-3">
              <div>
                <h2 id={titleId} className="font-serif text-xl font-semibold">
                  {title}
                </h2>
                {description ? (
                  <p id={descId} className="mt-1 text-sm text-fg-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton icon={XIcon} label="Close" size="sm" onClick={onClose} />
            </div>
            <div className="px-6 pb-6">{children}</div>
          </m.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
