import type { ReactNode } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { tr } from '@/i18n/tr';

export function Spinner({ className = 'h-6 w-6' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-gold-500 ${className}`} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex animate-fade-up flex-col items-center rounded-3xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-gold-500/30 bg-gold-500/5 text-gold-500">{icon}</div>
      <h3 className="font-display text-2xl text-white">{title}</h3>
      {text && <p className="mt-2 max-w-sm text-sm text-mist-2">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

function errorDetail(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { code?: unknown; message?: unknown };
  const parts = [e.code, e.message].filter((p) => typeof p === 'string' && p).map(String);
  return parts.length ? parts.join(' · ').slice(0, 120) : null;
}

export function ErrorState({ message = tr.errors.load, onRetry, error }: { message?: string; onRetry?: () => void; error?: unknown }) {
  const detail = errorDetail(error);
  return (
    <div className="flex flex-col items-center rounded-3xl border border-error-500/30 bg-error-900/30 px-6 py-10 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-error-300" />
      <p className="text-sm text-error-300">{message}</p>
      {detail && <p className="mt-2 max-w-md break-words font-mono text-[11px] text-error-300/70">{detail}</p>}
      {onRetry && (
        <Button variant="dark" size="sm" className="mt-4" onClick={onRetry}>
          {tr.common.retry}
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
