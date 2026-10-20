interface ProgressBarProps {
  /** 0 to 100. */
  value: number;
  label: string;
}

export function ProgressBar({ value, label }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border">
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
        className="h-full origin-left bg-accent transition-transform duration-(--vn-dur-base) ease-(--vn-ease)"
        style={{ transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  );
}
