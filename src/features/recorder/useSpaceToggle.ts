import { useEffect, useRef } from 'react';

const INTERACTIVE_SELECTOR = 'input, textarea, select, button, [contenteditable], [role="textbox"]';

/**
 * Calls onToggle when Space is pressed and focus is not on an interactive control.
 * A focused button already handles Space itself, so it is excluded to avoid a double toggle.
 */
export function useSpaceToggle(onToggle: () => void, enabled = true): void {
  const callbackRef = useRef(onToggle);

  useEffect(() => {
    callbackRef.current = onToggle;
  });

  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as Element | null;
      if (target?.closest?.(INTERACTIVE_SELECTOR)) return;
      event.preventDefault();
      callbackRef.current();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}
