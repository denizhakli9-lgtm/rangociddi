import { useState, type ReactNode } from 'react';
import { Check, ChevronRight, Copy, Map, MapPin, Navigation } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { directionsUrl, fullAddress, hasExactPin, type MapApp, type MapTarget } from '@/lib/maps';
import { useToast } from '@/contexts/ToastContext';
import { systemLinkClick } from '@/lib/platform';
import { tx } from '@/i18n/locale';

const APPS: { id: MapApp; label: [string, string]; hint: [string, string]; tone: string }[] = [
  { id: 'google', label: ['Google Haritalar', 'Google Maps'], hint: ['Telefon ve web', 'Phone and web'], tone: 'from-sky-400/25 to-sky-600/10 text-sky-300' },
  { id: 'apple', label: ['Apple Haritalar', 'Apple Maps'], hint: ['iPhone ve Mac', 'iPhone and Mac'], tone: 'from-slate-200/20 to-slate-400/5 text-slate-100' },
  { id: 'yandex', label: ['Yandex Haritalar', 'Yandex Maps'], hint: ['Trafik ve toplu taşıma', 'Traffic and public transport'], tone: 'from-amber-400/25 to-red-500/10 text-amber-300' },
];

interface SheetProps {
  open: boolean;
  onClose: () => void;
  target: MapTarget;
}

export function DirectionsSheet({ open, onClose, target }: SheetProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const address = fullAddress(target);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      toast(tx('Adres kopyalandı', 'Address copied'), 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(tx('Adres kopyalanamadı', 'Could not copy the address'), 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={tx('Yol tarifi', 'Directions')} subtitle={target.name}>
      <div className="mb-5 flex gap-3 rounded-2xl border border-line bg-ink/50 p-4">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gold-400" />
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-white">{address}</p>
          {!hasExactPin(target) && <p className="mt-1 text-xs text-mist-2">{tx('Harita uygulaması bu adresi arayarak açılacak.', 'The map app will search for this address.')}</p>}
        </div>
      </div>
      <p className="mb-3 text-xs font-medium tracking-wide text-mist">{tx('Hangi uygulamayla açılsın?', 'Open with which app?')}</p>
      <ul className="space-y-2">
        {APPS.map((app) => (
          <li key={app.id}>
            <a
              href={directionsUrl(app.id, target)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                systemLinkClick(directionsUrl(app.id, target))(e);
                onClose();
              }}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-coal-2 px-4 py-3.5 transition hover:border-white/30 hover:bg-white/[0.03]"
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${app.tone}`}>
                <Map className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-white">{tx(...app.label)}</span>
                <span className="block text-xs text-mist-2">{tx(...app.hint)}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-mist-3 transition group-hover:translate-x-0.5 group-hover:text-gold-400" />
            </a>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={copy}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-line py-3 text-sm text-mist transition hover:border-white/30 hover:text-white"
      >
        {copied ? <Check className="h-4 w-4 text-success-300" /> : <Copy className="h-4 w-4" />}
        {copied ? tx('Kopyalandı', 'Copied') : tx('Adresi kopyala', 'Copy address')}
      </button>
    </Modal>
  );
}

interface ButtonProps {
  target: MapTarget;
  className?: string;
  children?: ReactNode;
  ariaLabel?: string;
}

export function DirectionsButton({ target, className, children, ariaLabel }: ButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={className ?? 'inline-flex items-center gap-1.5 text-xs text-gold-400 transition hover:text-gold-300'}
      >
        {children ?? (
          <>
            <Navigation className="h-3.5 w-3.5" /> {tx('Yol tarifi al', 'Get directions')}
          </>
        )}
      </button>
      <DirectionsSheet open={open} onClose={() => setOpen(false)} target={target} />
    </>
  );
}
