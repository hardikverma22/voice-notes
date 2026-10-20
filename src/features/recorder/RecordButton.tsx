import { m, useTransform, type MotionValue } from 'motion/react';
import { MicrophoneIcon } from '../../design/icons';

interface RecordButtonProps {
  recording: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** Shown under the button when disabled, explaining why. */
  disabledReason?: string;
  /** Microphone loudness 0..1; drives the halo while recording. */
  level?: MotionValue<number>;
  paused?: boolean;
}

export function RecordButton({
  recording,
  onToggle,
  disabled = false,
  disabledReason,
  level,
  paused = false,
}: RecordButtonProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex size-36 items-center justify-center">
        {level ? <Halo level={level} visible={recording && !paused} /> : null}
        <m.button
          type="button"
          className={`relative z-10 flex size-24 items-center justify-center rounded-full shadow-lg transition-colors duration-(--vn-dur-base) focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${recording ? 'bg-record text-record-fg' : 'bg-accent text-accent-fg'}`}
          aria-pressed={recording}
          aria-label={recording ? 'Stop recording' : 'Start recording'}
          aria-disabled={disabled || undefined}
          whileHover={disabled ? undefined : { scale: 1.04 }}
          whileTap={disabled ? undefined : { scale: 0.92 }}
          onClick={() => {
            if (!disabled) onToggle();
          }}
        >
          <m.span
            aria-hidden="true"
            key={recording ? 'stop' : 'mic'}
            initial={{ scale: 0.4, opacity: 0, rotate: recording ? -45 : 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            className="flex items-center justify-center"
          >
            {recording ? (
              <span className="block size-7 rounded-[0.45rem] bg-current" />
            ) : (
              <MicrophoneIcon weight="fill" className="size-10" />
            )}
          </m.span>
        </m.button>
      </div>
      {disabled && disabledReason ? (
        <p className="text-center text-sm text-fg-muted">{disabledReason}</p>
      ) : null}
    </div>
  );
}

/** Two soft rings that grow with loudness. Static while paused or under reduced motion. */
function Halo({ level, visible }: { level: MotionValue<number>; visible: boolean }) {
  const inner = useTransform(level, [0, 1], [1, 1.35]);
  const outer = useTransform(level, [0, 1], [1.05, 1.6]);
  const outerOpacity = useTransform(level, [0, 1], [0.18, 0.4]);
  return (
    <m.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
    >
      <m.span className="absolute size-24 rounded-full bg-record/25" style={{ scale: inner }} />
      <m.span
        className="absolute size-24 rounded-full border-2 border-record"
        style={{ scale: outer, opacity: outerOpacity }}
      />
    </m.div>
  );
}
