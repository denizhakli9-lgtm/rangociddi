import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { LEGAL_VERSIONS, legalPath } from '@/lib/legal';
import { tx } from '@/i18n/locale';

const KEY = 'rango.cookie-notice';

function alreadySeen(): boolean {
  try {
    return localStorage.getItem(KEY) === LEGAL_VERSIONS.cookies;
  } catch {
    return false;
  }
}

/**
 * Informational notice only: the app uses strictly necessary and
 * user-requested preference storage, so no consent is collected (KVKK Çerez
 * Uygulamaları Rehberi). If analytics/marketing cookies are ever added, this
 * must become an opt-in consent banner that blocks them until accepted.
 */
export function CookieNotice() {
  const [open, setOpen] = useState(() => !alreadySeen());
  if (!open) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, LEGAL_VERSIONS.cookies);
    } catch {
      /* storage unavailable: hide for this visit only */
    }
    setOpen(false);
  };

  return (
    <div
      role="region"
      aria-label={tx('Çerez bilgilendirmesi', 'Cookie notice')}
      className="fixed inset-x-3 bottom-20 z-[80] mx-auto max-w-xl animate-fade-up rounded-2xl border border-gold-500/30 bg-coal/95 p-4 shadow-card backdrop-blur-xl md:bottom-5"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-gold-500" strokeWidth={1.6} />
        <p className="flex-1 text-xs leading-relaxed text-mist">
          {tx('Reklam veya analitik çerezi kullanmıyoruz. Tarayıcınızda yalnızca oturumunuzu ve seçtiğiniz tema/konum/dil tercihlerini saklıyoruz.', 'We use no advertising or analytics cookies. We only store your session and your theme, location and language choices on this device.')}{' '}
          <Link to={legalPath('cerez-politikasi')} className="font-semibold text-gold-400 hover:text-gold-300">
            {tx('Çerez Politikası', 'Cookie Policy')}
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full bg-gold-500 px-4 py-1.5 text-xs font-semibold text-ink transition hover:bg-gold-400"
        >
          {tx('Anladım', 'Got it')}
        </button>
      </div>
    </div>
  );
}
