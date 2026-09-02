'use client';

import * as React from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string;
  /** Milliseconds. `0` keeps the toast until dismissed. */
  readonly duration?: number;
}

interface ToastContextValue {
  readonly toasts: readonly Toast[];
  show: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const TONE_CONFIG = {
  success: { icon: CircleCheck, className: 'border-complete-border', iconClass: 'text-success' },
  error: { icon: CircleAlert, className: 'border-critical-border', iconClass: 'text-danger' },
  warning: { icon: TriangleAlert, className: 'border-undertime-border', iconClass: 'text-warning' },
  info: { icon: Info, className: 'border-border', iconClass: 'text-info' },
} as const;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<readonly Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = React.useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current, { ...toast, id }]);

      const duration = toast.duration ?? 5000;
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  const value = React.useMemo(
    () => ({ toasts, show, dismiss }),
    [toasts, show, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * Toasts announce politely and stack above the mobile bottom navigation.
 *
 * An error toast uses `alert` so it interrupts; the rest use `status` so they
 * queue behind whatever the user is currently reading.
 */
function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: readonly Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4',
        'sm:inset-x-auto sm:right-0 sm:bottom-0 sm:items-end',
        'pb-[calc(var(--shell-bottom-nav-height)+1rem)] md:pb-4',
      )}
      data-print="hide"
    >
      {toasts.map((toast) => {
        const config = TONE_CONFIG[toast.tone];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border',
              'bg-surface p-3.5 shadow-lg animate-[slide-up_200ms_cubic-bezier(0,0,0.15,1)]',
              config.className,
            )}
          >
            <Icon aria-hidden className={cn('mt-0.5 size-4.5 shrink-0', config.iconClass)} />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-semibold text-ink">{toast.title}</p>
              {toast.description && (
                <p className="mt-0.5 text-caption text-ink-muted">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="grid size-6 shrink-0 place-items-center rounded-xs text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
