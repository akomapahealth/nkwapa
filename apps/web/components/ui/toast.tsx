'use client';

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';
import { useMemo, useSyncExternalStore } from 'react';
import { Toaster, toast as sonner, type ExternalToast } from 'sonner';
import { ConfirmHost } from '@/components/ui/confirm-dialog';
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

/*
  Errors are announced assertively; everything else politely (#280). Sonner puts every toast in
  one polite region, so an error toast's visible words are hidden from assistive technology and a
  visually hidden `role="alert"` copy speaks them instead, for as long as the toast is shown. This
  is how Base UI's toast handles a high-priority toast; it avoids announcing an error twice.
*/
interface ToastAlert {
  id: string;
  /** Changes on every show, so re-showing the same error is announced again. */
  key: number;
  title: string;
  description?: string;
}

let alerts: ToastAlert[] = [];
let alertSequence = 0;
const alertListeners = new Set<() => void>();
const NO_ALERTS: ToastAlert[] = [];

function setAlerts(next: ToastAlert[]) {
  alerts = next;
  alertListeners.forEach((listener) => listener());
}

function dropAlert(id: string | number) {
  if (alerts.some((alert) => alert.id === String(id))) {
    setAlerts(alerts.filter((alert) => alert.id !== String(id)));
  }
}

function subscribeAlerts(listener: () => void) {
  alertListeners.add(listener);
  return () => {
    alertListeners.delete(listener);
  };
}

function ToastAlerts() {
  const current = useSyncExternalStore(
    subscribeAlerts,
    () => alerts,
    () => NO_ALERTS,
  );
  if (current.length === 0) return null;
  return (
    <div className="sr-only">
      {current.map((alert) => (
        <div key={alert.key} role="alert" aria-atomic="true">
          <p>{alert.title}</p>
          {alert.description ? <p>{alert.description}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function showToast({
  title,
  description,
  tone = 'info',
  // A failure stays until it is dismissed (R7.5): a failed save must not vanish while unread.
  durationMs = tone === 'loading' || tone === 'error' ? 0 : DEFAULT_DURATION_MS,
  action,
  id,
}: ToastInput): string {
  const options: ExternalToast = {
    id,
    description:
      tone === 'error' && description ? <span aria-hidden="true">{description}</span> : description,
    duration: durationMs > 0 ? durationMs : Infinity,
    action: action ? { label: action.label, onClick: action.onClick } : undefined,
    onDismiss: (shown) => dropAlert(shown.id),
    onAutoClose: (shown) => dropAlert(shown.id),
  };
  const shown =
    tone === 'info'
      ? sonner.info(title, options)
      : tone === 'success'
        ? sonner.success(title, options)
        : tone === 'warning'
          ? sonner.warning(title, options)
          : tone === 'error'
            ? sonner.error(<span aria-hidden="true">{title}</span>, options)
            : sonner.loading(title, options);
  const shownId = String(shown);
  const others = alerts.filter((alert) => alert.id !== shownId);
  setAlerts(
    tone === 'error'
      ? [...others, { id: shownId, key: ++alertSequence, title, description }]
      : others,
  );
  return shownId;
}

export function dismissToast(id?: string | number) {
  sonner.dismiss(id);
  if (id === undefined) setAlerts([]);
  else dropAlert(id);
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
  // Settled through showToast, not sonner.promise, so a failure gets the assertive announcement.
  const id = showToast({
    tone: 'loading',
    title: messages.loading,
    description: messages.description,
  });
  promise.then(
    (value) =>
      showToast({
        id,
        tone: 'success',
        title: typeof messages.success === 'function' ? messages.success(value) : messages.success,
        description: messages.description,
      }),
    (error: unknown) =>
      showToast({
        id,
        tone: 'error',
        title: typeof messages.error === 'function' ? messages.error(error) : messages.error,
        description: messages.description,
      }),
  );
  return promise;
}

/*
  Tones mirror the old toast and the tinted-status rule in MASTER.md section 3: tinted fills use
  the `-ink` tokens for text, never the fill token. `unstyled` hands every pixel to these classes,
  so a toast reads as part of the product rather than as a library default.
*/
const toastClassNames = {
  // Opaque on purpose. A tinted, see-through toast let the header read through it; tone is
  // carried by the icon and the border instead, and the text stays on the card surface.
  toast:
    'group pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border border-border bg-card p-4 pr-10 text-sm text-foreground shadow-lg',
  title: 'font-semibold leading-5',
  description: 'mt-1 leading-5 text-muted-foreground',
  icon: 'relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5',
  content: 'min-w-0 flex-1',
  actionButton:
    'ml-auto inline-flex h-9 shrink-0 items-center rounded-md border border-input bg-background px-3 text-xs font-medium text-primary transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  cancelButton:
    'inline-flex h-9 shrink-0 items-center rounded-md px-3 text-xs font-medium text-muted-foreground hover:bg-muted',
  // Unstyled, Sonner leaves this as the first flex child, in front of the icon. Pin it top-right.
  closeButton:
    'absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:h-3.5 [&>svg]:w-3.5 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
  success: 'border-success/40',
  warning: 'border-warning/50',
  error: 'border-destructive/40',
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
        // Clear of the status bar and notch in the installed app (#206); env() is 0 in a tab.
        offset={{
          top: 'calc(20px + env(safe-area-inset-top))',
          right: 'calc(20px + env(safe-area-inset-right))',
        }}
        mobileOffset={{
          top: 'calc(16px + env(safe-area-inset-top))',
          right: 'calc(16px + env(safe-area-inset-right))',
          left: 'calc(16px + env(safe-area-inset-left))',
        }}
        icons={toastIcons}
        containerAriaLabel="Notifications"
        toastOptions={{ unstyled: true, classNames: toastClassNames }}
      />
      <ToastAlerts />
      {/* Beside the toaster because both are app-wide, imperative, and mounted once. */}
      <ConfirmHost />
    </>
  );
}

export function useToast() {
  return useMemo(() => ({ showToast, dismissToast, toastPromise }), []);
}
