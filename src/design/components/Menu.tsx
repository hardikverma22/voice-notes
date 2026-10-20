import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Icon } from '../icons';

export interface MenuItem {
  label: string;
  icon?: Icon;
  onSelect: () => void;
  danger?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
}

/** Dropdown menu: opens from its trigger, arrow keys move, Escape closes and returns focus. */
export function Menu({
  trigger,
  items,
  align = 'end',
}: {
  trigger: (props: {
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    // Escape closes the menu wherever focus is.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.querySelector('button')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.querySelector('button')?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(index + 1) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Tab') {
      close(false);
    }
  }

  return (
    <div className="relative">
      <span ref={triggerRef} className="contents">
        {trigger({
          onClick: () => setOpen((value) => !value),
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': id,
        })}
      </span>
      <AnimatePresence>
        {open ? (
          <m.div
            ref={listRef}
            id={id}
            role="menu"
            onKeyDown={onKeyDown}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            style={{ transformOrigin: align === 'end' ? 'top right' : 'top left' }}
            className={`absolute top-full z-40 mt-2 min-w-52 rounded-md border border-border bg-surface p-1.5 shadow-lg ${align === 'end' ? 'right-0' : 'left-0'}`}
          >
            {items.map((item) => {
              const IconComponent = item.icon;
              return (
                <div key={item.label}>
                  {item.separated ? <div className="my-1.5 h-px bg-border" /> : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      close();
                      item.onSelect();
                    }}
                    className={`flex min-h-10 w-full items-center gap-3 rounded-sm px-3 text-left text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2 ${item.danger ? 'text-danger' : 'text-fg'}`}
                  >
                    {IconComponent ? (
                      <IconComponent aria-hidden="true" className="size-[1.1rem] opacity-80" />
                    ) : null}
                    {item.label}
                  </button>
                </div>
              );
            })}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
