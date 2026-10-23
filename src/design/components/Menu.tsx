import { AnimatePresence, m } from 'motion/react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { Icon } from '../icons';

export interface MenuItem {
  label: string;
  icon?: Icon;
  onSelect: () => void;
  danger?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
  /** Leave focus where onSelect puts it (for example a rename field) instead of the trigger. */
  keepFocus?: boolean;
}

const EDGE = 8;

/**
 * Dropdown menu: opens from its trigger, arrow keys move, Escape closes and returns focus.
 * With contextTarget it also opens at the pointer on right-click (or the context-menu key)
 * anywhere on that element, kept inside the viewport.
 */
export function Menu({
  trigger,
  items,
  align = 'end',
  contextTarget,
}: {
  trigger: (props: {
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  contextTarget?: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = contextTarget?.current;
    if (!target) return;
    const onContext = (event: MouseEvent) => {
      // Text fields keep the browser's own menu (spelling, paste).
      if ((event.target as Element | null)?.closest('input, textarea')) return;
      event.preventDefault();
      // The keyboard context-menu key reports no pointer position; use the element's corner.
      const fromKeyboard = event.clientX === 0 && event.clientY === 0;
      const rect = target.getBoundingClientRect();
      setPoint(
        fromKeyboard
          ? { x: rect.left + 16, y: rect.top + 16 }
          : { x: event.clientX, y: event.clientY },
      );
      setOpen(true);
    };
    target.addEventListener('contextmenu', onContext);
    return () => target.removeEventListener('contextmenu', onContext);
  }, [contextTarget]);

  // Keep a pointer-opened menu on screen: flip up or left when it would overflow.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!open || !point || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const x = Math.max(EDGE, Math.min(point.x, window.innerWidth - width - EDGE));
    const y =
      point.y + height > window.innerHeight - EDGE ? Math.max(EDGE, point.y - height) : point.y;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [open, point]);

  useEffect(() => {
    if (!open) return;
    const first = listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
        setPoint(null);
      }
    };
    // Escape closes the menu wherever focus is.
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setPoint(null);
        triggerRef.current?.querySelector('button')?.focus();
      }
    };
    const onScroll = () => {
      setOpen(false);
      setPoint(null);
    };
    // A menu pinned to the pointer would float away from its row on scroll; close it.
    if (point) window.addEventListener('scroll', onScroll, true);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, point]);

  function close(returnFocus = true) {
    setOpen(false);
    setPoint(null);
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

  const list = (
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
          style={{
            transformOrigin: point ? 'top left' : align === 'end' ? 'top right' : 'top left',
            ...(point ? { left: point.x, top: point.y } : null),
          }}
          className={`z-50 min-w-52 rounded-md border border-border bg-surface p-1.5 shadow-lg ${point ? 'fixed' : `absolute top-full mt-2 ${align === 'end' ? 'right-0' : 'left-0'}`}`}
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
                    close(!item.keepFocus);
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
  );

  return (
    <div className="relative">
      <span ref={triggerRef} className="contents">
        {trigger({
          onClick: () => {
            setPoint(null);
            setOpen((value) => !value);
          },
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': id,
        })}
      </span>
      {/* A pointer-opened menu escapes transformed ancestors, which would break fixed. */}
      {point ? createPortal(list, document.body) : list}
    </div>
  );
}
