import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import photo from '@/assets/bakim.jpg';
import { COMPANY, legalPath } from '@/lib/legal';
import { tx } from '@/i18n/locale';
import './maintenance.css';

/**
 * Full-screen maintenance notice. Shown on every route while `maintenanceActive` is on.
 *
 * Styled with plain CSS (maintenance.css) rather than the themed colour tokens:
 * the text always sits on the dark photo, whichever theme the visitor picked.
 */
export default function Maintenance() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${tx('Bakımdayız', 'Under maintenance')} | ${COMPANY.brand}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    const previousColor = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', '#000000');
    return () => {
      document.title = previousTitle;
      if (meta && previousColor !== null) meta.setAttribute('content', previousColor);
    };
  }, []);

  return (
    <div className="maint-root">
      <img src={photo} alt="" aria-hidden="true" className="maint-backdrop" />
      <div className="maint-stage">
        <img src={photo} alt="" draggable={false} className="maint-photo" />
      </div>

      <div className="maint-foot">
        <p>{tx('Yakında yeniden buradayız.', 'We will be back soon.')}</p>
        <nav aria-label={tx('Yasal bağlantılar', 'Legal links')} className="maint-links">
          <Link to={legalPath('aydinlatma-metni')}>{tx('KVKK Aydınlatma Metni', 'Privacy Notice (KVKK)')}</Link>
          <Link to={legalPath('kullanim-kosullari')}>{tx('Kullanım Koşulları', 'Terms of Use')}</Link>
          <Link to={legalPath('kunye')}>{tx('Künye ve İletişim', 'Company & Contact')}</Link>
        </nav>
      </div>

      <div className="maint-stage maint-stage-top">
        <h1 className="maint-pill">
          <span className="maint-pill-icon" aria-hidden="true">
            <Wrench strokeWidth={2} />
          </span>
          {tx('Site bakımda', 'Under maintenance')}
        </h1>
      </div>
    </div>
  );
}
