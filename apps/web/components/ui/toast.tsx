'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { useMemo } from 'react';
import { Toaster, toast as sonner, type ExternalToast } from 'sonner';
import { useTheme } from '@/lib/theme-context';

/**
 * Toasts, on Sonner.
 *
 * The hand-rolled stack this replaces had no enter or exit motion and no way to change a toast
 * once shown, so a "Saving…" toast could not become "Saved" -- it was dismissed and a second one
 * appeared beside it. Sonner gives both, plus swipe-to-dismiss and timers that pause while the
 * tab is hidden or the stack is hovered.
 *
 * `useToast().showToast` keeps its old shape so no caller had to change. Passing the `id` a
 * previous call returned updates that toast in place, which is how a loading toast settles.
 */

type ToastTone = 'info' | 'success' | 'warning' | 'error' | 'loading';

interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** 0 or less keeps the toast until it is dismissed. */
  durationMs?: number;
  /** One follow-up, e.g. opening the screen the toast is about. Choosing it dismisses the toast. */
  action?: ToastAction;
  /** Update the toast with this id instead of showing a new one. */
  id?: string | number;
}

const DEFAULT_DURATION_MS = 4200;

export function showToast({
  title,
  description,
  tone = 'info',
  durationMs = tone === 'loading' ? 0 : DEFAULT_DURATION_MS,
  action,
  id,
}: ToastInput): string {
  const options: ExternalToast = {
    id,
    description,
    duration: durationMs > 0 ? durationMs : Infinity,
    action: action ? { label: action.label, onClick: action.onClick } : undefined,
  };
  const shown =
    tone === 'info'
      ? sonner.info(title, options)
      : tone === 'success'
        ? sonner.success(title, options)
        : tone === 'warning'
          ? sonner.warning(title, options)
          : tone === 'error'
            ? sonner.error(title, options)
            : sonner.loading(title, options);
  return String(shown);
}

export function dismissToast(id?: string | number) {
  sonner.dismiss(id);
}

/**
 * Show a loading toast for a promise, and settle it in place as success or error.
 * Resolves or rejects with the promise itself, so callers still handle the result.
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((value: T) => string);
    error: string | ((error: unknown) => string);
    description?: string;
  },
): Promise<T> {
  sonner.promise(promise, {
    loading: messages.loading,
    success: messages.success,
    error: messages.error,
    description: messages.description,
  });
  return promise;
}

/*
  Tones mirror the old toast and the tinted-status rule in MASTER.md section 3: tinted fills use
  the `-ink` tokens for text, never the fill token. `unstyled` hands every pixel to these classes,
  so a toast reads as part of the product rather than as a library default.
*/
const toastClassNames = {
  toast:
    'group pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border/80 bg-card p-4 text-sm text-foreground shadow-lg',
  title: 'font-semibold leading-5',
  description: 'mt-1 leading-5 text-muted-foreground',
  icon: 'relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5',
  content: 'min-w-0 flex-1',
  actionButton:
    'ml-auto inline-flex h-9 shrink-0 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-primary transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  cancelButton:
    'inline-flex h-9 shrink-0 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted',
  closeButton:
    'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
  success:
    'border-success/25 bg-success/10 text-success-ink [&_[data-description]]:text-success-ink/80',
  warning:
    'border-warning/25 bg-warning/10 text-warning-ink [&_[data-description]]:text-warning-ink/80',
  error: 'border-destructive/25 bg-destructive/10',
  info: '',
  loading: '',
};

const toastIcons = {
  success: <CheckCircle2 aria-hidden="true" className="text-success" />,
  info: <Info aria-hidden="true" className="text-primary" />,
  warning: <AlertTriangle aria-hidden="true" className="text-warning" />,
  error: <XCircle aria-hidden="true" className="text-destructive" />,
  loading: <Loader2 aria-hidden="true" className="animate-spin text-primary" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <>
      {children}
      <Toaster
        position="top-right"
        theme={theme}
        visibleToasts={4}
        closeButton
        gap={10}
        offset={20}
        mobileOffset={16}
        icons={toastIcons}
        containerAriaLabel="Notifications"
        toastOptions={{ unstyled: true, classNames: toastClassNames }}
      />
    </>
  );
}

export function useToast() {
  return useMemo(() => ({ showToast, dismissToast, toastPromise }), []);
}
