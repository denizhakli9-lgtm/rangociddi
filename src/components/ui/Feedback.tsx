import { useEffect, type ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { dict } from '@/i18n/locale';

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-mist-3 ${className}`} strokeWidth={1.75} />;
}

export function PageLoader() {
  return (
    // Fills the screen below the header, so the footer stays out of view and does not jump when the page arrives.
    <div className="flex min-h-[calc(100vh-5.5rem-env(safe-area-inset-top))] items-center supports-[height:100svh]:min-h-[calc(100svh-5.5rem-env(safe-area-inset-top))] justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-coal px-6 py-12 text-center">
      <div className="mb-4 text-mist-3 [&>svg]:h-7 [&>svg]:w-7">{icon}</div>
      <h3 className="text-base font-semibold text-white">{title}</h3>
      {text && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-mist-2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/**
 * Friendly Turkish error block. Raw backend details (Postgres/PostgREST codes and messages)
 * are never rendered; when `error` is passed they are only written to the console, and only
 * in development builds (import.meta.env.DEV), so production users never see them.
 */
export function ErrorState({ message = dict().errors.load, onRetry, error }: { message?: string; onRetry?: () => void; error?: unknown }) {
  useEffect(() => {
    if (error && import.meta.env.DEV) console.error(error);
  }, [error]);
  return (
    <div role="alert" className="flex flex-col items-center rounded-2xl border border-error-500/30 bg-error-500/5 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 h-6 w-6 text-error-300" strokeWidth={1.75} />
      <p className="text-sm text-error-300">{message}</p>
      {onRetry && (
        <Button variant="dark" size="sm" className="mt-4" onClick={onRetry}>
          {dict().common.retry}
        </Button>
      )}
    </div>
  );
}

export function SkeletonList({ count = 3, className = 'h-28' }: { count?: number; className?: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`skeleton ${className}`} />
      ))}
    </div>
  );
}
