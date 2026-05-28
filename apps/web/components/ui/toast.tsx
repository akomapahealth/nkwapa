'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ToastTone = 'info' | 'success' | 'warning' | 'error' | 'loading';

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface ToastItem extends Required<ToastInput> {
  id: string;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<
  ToastTone,
  { icon: LucideIcon; className: string; iconClassName: string }
> = {
  info: {
    icon: Info,
    className: 'border-primary/20 bg-card text-foreground',
    iconClassName: 'text-primary',
  },
  success: {
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    iconClassName: 'text-emerald-600',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-950',
    iconClassName: 'text-amber-600',
  },
  error: {
    icon: XCircle,
    className: 'border-destructive/25 bg-destructive/10 text-foreground',
    iconClassName: 'text-destructive',
  },
  loading: {
    icon: Loader2,
    className: 'border-primary/20 bg-card text-foreground',
    iconClassName: 'animate-spin text-primary',
  },
};

function createToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismissToast = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ title, description = '', tone = 'info', durationMs = 4200 }: ToastInput) => {
      const id = createToastId();
      const nextToast: ToastItem = { id, title, description, tone, durationMs };
      setToasts((current) => [nextToast, ...current].slice(0, 4));

      if (durationMs > 0) {
        const timer = setTimeout(() => dismissToast(id), durationMs);
        timers.current.set(id, timer);
      }

      return id;
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ showToast, dismissToast }), [dismissToast, showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions text"
        className="fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:right-5 sm:top-5"
      >
        {toasts.map((toast) => {
          const tone = toneStyles[toast.tone];
          const Icon = tone.icon;

          return (
            <div
              key={toast.id}
              className={cn(
                'rounded-2xl border p-4 shadow-2xl shadow-black/10 backdrop-blur transition-all',
                tone.className,
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', tone.iconClassName)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-5">{toast.title}</p>
                  {toast.description ? (
                    <p className="mt-1 text-sm leading-5 text-current/75">{toast.description}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 rounded-full text-current/65 hover:bg-current/10 hover:text-current"
                  onClick={() => dismissToast(toast.id)}
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Dismiss notification</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      showToast: () => '',
      dismissToast: () => undefined,
    };
  }
  return ctx;
}
