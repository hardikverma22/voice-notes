import { displayText, type LiveState } from './merge';

/**
 * Committed text is announced politely. Tentative text is dimmed and hidden from screen
 * readers, so the same words are not read twice as they firm up.
 */
export function LiveTranscript({ state }: { state: LiveState }) {
  const { committed, tentative } = displayText(state);
  return (
    <div
      role="region"
      aria-label="Live transcript"
      aria-live="polite"
      aria-atomic="false"
      className="rounded-md bg-surface p-4 leading-(--vn-leading-body) shadow-sm"
    >
      {state.committed.map((segment, index) => (
        <span key={index} className="vn-fade-in">
          {index === 0 ? '' : ' '}
          {segment.text.trim()}
        </span>
      ))}
      {committed && tentative ? ' ' : ''}
      <span aria-hidden="true" className="italic text-fg-muted">
        {tentative}
      </span>
      {!committed && !tentative ? <span className="text-fg-muted">Listening…</span> : null}
    </div>
  );
}
