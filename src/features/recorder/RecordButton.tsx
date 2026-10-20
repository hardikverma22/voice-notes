interface RecordButtonProps {
  recording: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Shown under the button when disabled, explaining why. */
  disabledReason?: string;
  /** Label under the button, e.g. elapsed time. */
  caption?: string;
}

export function RecordButton({
  recording,
  onToggle,
  disabled = false,
  disabledReason,
  caption,
}: RecordButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        className="vn-record relative flex size-18 items-center justify-center rounded-full bg-accent text-accent-fg shadow-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        aria-pressed={recording}
        aria-label={recording ? 'Stop recording' : 'Start recording'}
        aria-disabled={disabled || undefined}
        onClick={() => {
          if (!disabled) onToggle();
        }}
      >
        {recording ? (
          <span aria-hidden="true" className="block size-6 rounded-sm bg-accent-fg" />
        ) : (
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-8" fill="currentColor">
            <circle cx="12" cy="12" r="6" />
          </svg>
        )}
      </button>
      <p className="min-h-6 text-sm text-fg-muted" aria-live="polite">
        {caption ?? (recording ? 'Stop' : 'Record')}
      </p>
      {disabled && disabledReason ? (
        <p className="text-center text-sm text-fg-muted">{disabledReason}</p>
      ) : null}
    </div>
  );
}
