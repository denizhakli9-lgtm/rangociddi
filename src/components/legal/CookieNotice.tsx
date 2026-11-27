import { useState } from 'react';
import { Link } from 'react-router-dom';
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
      data-cookie-notice
      aria-label={tx('Çerez bilgilendirmesi', 'Cookie notice')}
      className="fixed inset-x-3 bottom-[76px] z-[80] animate-fade-up rounded-xl border border-line bg-coal p-4 shadow-pop md:inset-x-auto md:bottom-5 md:left-5 md:max-w-sm [body:has([data-booking-bar])_&]:bottom-[156px] lg:[body:has([data-booking-bar])_&]:bottom-5"
    >
      <div className="flex items-end gap-4 md:flex-col md:items-start md:gap-3">
        <p className="flex-1 text-xs leading-relaxed text-mist">
          {tx('Reklam veya analitik çerezi kullanmıyoruz. Tarayıcınızda yalnızca oturumunuzu ve seçtiğiniz tema/konum/dil tercihlerini saklıyoruz.', 'We use no advertising or analytics cookies. We only store your session and your theme, location and language choices on this device.')}{' '}
          <Link to={legalPath('cerez-politikasi')} className="font-medium text-white underline underline-offset-2">
            {tx('Çerez Politikası', 'Cookie Policy')}
          </Link>
        </p>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary/90"
        >
          {tx('Anladım', 'Got it')}
        </button>
      </div>
    </div>
  );
}
