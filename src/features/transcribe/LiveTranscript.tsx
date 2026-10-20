import { AnimatePresence, m } from 'motion/react';
import { useEffect, useRef } from 'react';
import { displayText, type LiveState } from './merge';
import { useModel } from './modelStore';

/**
 * Committed text is announced politely. Tentative text is dimmed and hidden from screen
 * readers, so the same words are not read twice as they firm up.
 */
export function LiveTranscript({ state, paused = false }: { state: LiveState; paused?: boolean }) {
  const { committed, tentative } = displayText(state);
  const model = useModel();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [committed, tentative]);

  const empty = !committed && !tentative;
  const waitingText =
    model.status === 'ready'
      ? paused
        ? 'Paused'
        : 'Listening…'
      : 'Your audio is being saved. Live text appears once the speech model is downloaded, and if you stop before then, the full transcript is written right after.';
  return (
    <div className="w-full rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between px-5 pt-4 text-xs font-medium tracking-wide text-fg-muted uppercase">
        <span>Live transcript</span>
        <span className="normal-case tracking-normal">Draft · refined after you stop</span>
      </div>
      <div
        ref={scrollRef}
        role="region"
        aria-label="Live transcript"
        aria-live="polite"
        aria-atomic="false"
        className="vn-scroll max-h-56 min-h-24 overflow-y-auto px-5 pt-2 pb-5 text-left text-[1.0625rem] leading-(--vn-leading-body)"
      >
        <AnimatePresence initial={false}>
          {state.committed.map((segment, index) => (
            <m.span
              key={index}
              initial={{ opacity: 0, filter: 'blur(4px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              transition={{ duration: 0.35 }}
            >
              {index === 0 ? '' : ' '}
              {segment.text.trim()}
            </m.span>
          ))}
        </AnimatePresence>
        {committed && tentative ? ' ' : ''}
        <span aria-hidden="true" className="text-fg-muted">
          {tentative}
        </span>
        {empty ? (
          <span className="inline-flex items-center gap-2 text-fg-muted">
            {model.status === 'ready' && !paused ? <TypingDots /> : null}
            {waitingText}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span aria-hidden="true" className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <m.span
          key={i}
          className="size-1.5 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}
