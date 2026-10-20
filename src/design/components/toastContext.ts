import { createContext } from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  actions?: ToastAction[];
  /** Auto-dismiss after this many ms. 0 keeps the toast until dismissed. Default 6000. */
  durationMs?: number;
}

export interface ToastContextValue {
  show(options: ToastOptions): void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);
