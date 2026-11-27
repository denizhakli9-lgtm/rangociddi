import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { tx } from '@/i18n/locale';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

export function Modal({ open, onClose, title, subtitle, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} />
      <div
        className={`relative flex max-h-[92vh] w-full animate-slide-up flex-col rounded-t-2xl border border-line bg-coal pb-[env(safe-area-inset-bottom)] shadow-pop supports-[height:100dvh]:max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-0.5rem))] sm:animate-scale-in sm:rounded-2xl sm:pb-0 ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
          <div>
            <h2 className="text-lg font-semibold leading-snug text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-mist-2">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="-mr-2 -mt-1 rounded-lg p-2 text-mist-2 transition hover:bg-white/5 hover:text-white" aria-label={tx('Kapat', 'Close')}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
