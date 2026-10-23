import { m } from 'motion/react';
import { useId } from 'react';
import type { Icon } from '../icons';

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: Icon;
}

/** Single-choice control rendered as a radio group with a sliding indicator. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex self-start rounded-full bg-surface-2 p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        const IconComponent = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-focus ${selected ? 'text-fg' : 'text-fg-muted hover:text-fg'}`}
          >
            {selected ? (
              <m.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full bg-surface shadow-sm"
              />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {IconComponent ? <IconComponent aria-hidden="true" className="size-4" /> : null}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
