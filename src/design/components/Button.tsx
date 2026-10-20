import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { Icon } from '../icons';

type Variant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';
type Size = 'sm' | 'md';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg shadow-sm hover:brightness-110',
  secondary: 'border border-border bg-surface text-fg shadow-sm hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  soft: 'bg-accent-soft text-accent hover:brightness-95',
  danger: 'border border-border bg-surface text-danger hover:bg-surface-2',
};

const SIZE_CLASS: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
};

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: Icon;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon: IconComponent,
    className = '',
    type = 'button',
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-[background-color,filter,transform] duration-(--vn-dur-fast) active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${focusRing} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...props}
    >
      {IconComponent ? (
        <IconComponent aria-hidden="true" className="size-[1.15em] shrink-0" weight="bold" />
      ) : null}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: Icon;
  label: string;
  size?: Size;
  active?: boolean;
}

/** Square icon-only button. The label is the accessible name and the tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon: IconComponent,
    label,
    size = 'md',
    active = false,
    className = '',
    type = 'button',
    ...props
  },
  ref,
) {
  const box = size === 'sm' ? 'size-9' : 'size-11';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-(--vn-dur-fast) active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 ${focusRing} ${box} ${active ? 'bg-accent-soft text-accent' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'} ${className}`}
      {...props}
    >
      <IconComponent aria-hidden="true" className="size-5" weight={active ? 'fill' : 'regular'} />
    </button>
  );
});
