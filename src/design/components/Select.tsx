import type { SelectHTMLAttributes } from 'react';
import { CaretDownIcon } from '../icons';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

/**
 * A native select, so the option list stays the platform's own (accessible, and a proper picker
 * on phones), drawn like the app's other fields: pill shape, soft shadow, accent focus glow and
 * a Phosphor caret in place of the browser's arrow.
 */
export function Select({ value, options, onChange, className = '', ...props }: SelectProps) {
  return (
    <div className={`relative w-full max-w-xs ${className}`}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="peer min-h-11 w-full cursor-pointer appearance-none rounded-full border border-border bg-surface pr-11 pl-4 text-base text-fg shadow-sm transition-[border-color,box-shadow] duration-(--vn-dur-fast) outline-none hover:border-control focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20 sm:text-sm"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <CaretDownIcon
        aria-hidden="true"
        weight="bold"
        className="pointer-events-none absolute top-1/2 right-4 size-3.5 -translate-y-1/2 text-fg-muted transition-colors peer-hover:text-fg peer-focus-visible:text-accent"
      />
    </div>
  );
}
