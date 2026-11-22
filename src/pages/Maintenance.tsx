import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { COMPANY, legalPath } from '@/lib/legal';
import { tx } from '@/i18n/locale';
import './maintenance.css';

export default function Maintenance() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${tx('Bakımdayız', 'Under maintenance')} | ${COMPANY.brand}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    const previousColor = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', '#080b10');
    return () => {
      document.title = previousTitle;
      if (meta && previousColor !== null) meta.setAttribute('content', previousColor);
    };
  }, []);

  return (
    <main className="maint-root">
      <div className="maint-content">
        <p className="maint-brand">RANGO · {tx('BAKIM', 'MAINTENANCE')}</p>
        <h1 className="maint-names" aria-label="Sude kalp Deniz">
          <span>Sude</span>
          <Heart aria-hidden="true" className="maint-heart" strokeWidth={1.5} />
          <span>Deniz</span>
        </h1>
        <p className="maint-message">{tx('Bakım devam ediyor. Yakında yeniden buradayız.', 'Maintenance is ongoing. We will be back soon.')}</p>
      </div>
      <nav aria-label={tx('Yasal bağlantılar', 'Legal links')} className="maint-links">
        <Link to={legalPath('aydinlatma-metni')}>{tx('Gizlilik Politikası (KVKK)', 'Privacy Policy (KVKK)')}</Link>
        <Link to={legalPath('kullanim-kosullari')}>{tx('Kullanım Koşulları', 'Terms of Use')}</Link>
        <Link to={legalPath('kunye')}>{tx('Künye ve İletişim', 'Company & Contact')}</Link>
      </nav>
    </main>
  );
}
