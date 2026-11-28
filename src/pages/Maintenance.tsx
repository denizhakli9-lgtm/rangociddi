import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import { COMPANY, legalPath } from '@/lib/legal';
import { tx } from '@/i18n/locale';
import './maintenance.css';

/** Sunburst rays, computed once at module load (static geometry, no animation loop). */
const RAYS = Array.from({ length: 36 }, (_, i) => {
  const step = 360 / 36;
  const a = ((i * step - 90) * Math.PI) / 180;
  const b = (((i + 0.5) * step - 90) * Math.PI) / 180;
  const r = 1000;
  const p = (ang: number) => `${(Math.cos(ang) * r).toFixed(1)} ${(Math.sin(ang) * r).toFixed(1)}`;
  return `M0 0 L${p(a)} L${p(b)} Z`;
});

/** Fine rays inside the crest fan (upper half only). */
const CREST_RAYS = Array.from({ length: 11 }, (_, i) => {
  const ang = Math.PI + (Math.PI * (i + 1)) / 12;
  const x = (Math.cos(ang) * 58).toFixed(2);
  const y = (Math.sin(ang) * 58).toFixed(2);
  const x0 = (Math.cos(ang) * 30).toFixed(2);
  const y0 = (Math.sin(ang) * 30).toFixed(2);
  return `M${x0} ${y0} L${x} ${y}`;
});

const SPARKS = [
  { top: '12%', left: '9%', delay: '0s', size: 10 },
  { top: '22%', left: '88%', delay: '1.4s', size: 14 },
  { top: '68%', left: '6%', delay: '2.6s', size: 12 },
  { top: '82%', left: '92%', delay: '0.8s', size: 9 },
  { top: '46%', left: '95%', delay: '3.4s', size: 8 },
  { top: '40%', left: '3%', delay: '4.2s', size: 8 },
];

function Corner({ className }: { className: string }) {
  return (
    <svg className={`deco-corner ${className}`} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <path className="deco-draw" pathLength={1} d="M2 54 V2 H54" />
      <path className="deco-draw deco-draw--thin" pathLength={1} d="M9 36 V9 H36" />
      <path className="deco-draw deco-draw--thin" pathLength={1} d="M2 16 H16 V2" />
      <path className="deco-draw deco-draw--thin" pathLength={1} d="M16 16 L21 21" />
      <path className="deco-gem" d="M25 19 L31 25 L25 31 L19 25 Z" />
    </svg>
  );
}

function Spark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 0 C10.8 6.5 13.5 9.2 20 10 C13.5 10.8 10.8 13.5 10 20 C9.2 13.5 6.5 10.8 0 10 C6.5 9.2 9.2 6.5 10 0 Z" fill="currentColor" />
    </svg>
  );
}

export default function Maintenance() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${tx('Bakımdayız', 'Under maintenance')} | ${COMPANY.brand}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    const previousColor = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', '#08080a');
    return () => {
      document.title = previousTitle;
      if (meta && previousColor !== null) meta.setAttribute('content', previousColor);
    };
  }, []);

  const assurances = [
    { icon: CalendarCheck, label: tx('Randevularınız güvende', 'Your bookings are safe') },
    { icon: ShieldCheck, label: tx('Hesabınız korunuyor', 'Your account is protected') },
    { icon: Sparkles, label: tx('Yenilenen deneyim', 'A refreshed experience') },
  ];

  return (
    <main className="deco-root" lang={tx('tr', 'en')}>
      {/* Atmosphere: fan scales, glow, twinkling sparks */}
      <div className="deco-atmos" aria-hidden="true">
        <div className="deco-pattern" />
        <div className="deco-glow" />
        {SPARKS.map((s, i) => (
          <span key={i} className="deco-spark" style={{ top: s.top, left: s.left, animationDelay: s.delay }}>
            <Spark size={s.size} />
          </span>
        ))}
      </div>

      {/* Frame and footer are centred together as one group */}
      <div className="deco-group">
        <div className="deco-stage">
          {/* Sunburst rising behind the crest */}
          <div className="deco-sun" aria-hidden="true">
            <svg viewBox="-1000 -1000 2000 2000" focusable="false">
              <defs>
                <radialGradient id="deco-ray-fade" cx="0" cy="0" r="1000" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#F5ECC8" stopOpacity="0.55" />
                  <stop offset="0.18" stopColor="#D4AF37" stopOpacity="0.32" />
                  <stop offset="0.55" stopColor="#B8952A" stopOpacity="0.1" />
                  <stop offset="1" stopColor="#8F7321" stopOpacity="0" />
                </radialGradient>
              </defs>
              <g className="deco-sun-rays" fill="url(#deco-ray-fade)">
                {RAYS.map((d, i) => (
                  <path key={i} d={d} />
                ))}
              </g>
              <g fill="none" stroke="#D4AF37" strokeOpacity="0.16">
                <circle r="170" />
                <circle r="176" strokeOpacity="0.08" />
                <circle r="330" strokeOpacity="0.1" />
                <circle r="520" strokeOpacity="0.06" />
              </g>
            </svg>
          </div>

          <section className="deco-frame" aria-labelledby="deco-title">
            {/* Double gold frame, drawn in on load */}
            <div className="deco-lines" aria-hidden="true">
              <span className="deco-edge deco-edge--h deco-edge--top" />
              <span className="deco-edge deco-edge--h deco-edge--bottom" />
              <span className="deco-edge deco-edge--v deco-edge--left" />
              <span className="deco-edge deco-edge--v deco-edge--right" />
              <span className="deco-edge deco-edge--h deco-edge--top deco-edge--inner" />
              <span className="deco-edge deco-edge--h deco-edge--bottom deco-edge--inner" />
              <span className="deco-edge deco-edge--v deco-edge--left deco-edge--inner" />
              <span className="deco-edge deco-edge--v deco-edge--right deco-edge--inner" />
              <Corner className="deco-corner--tl" />
              <Corner className="deco-corner--tr" />
              <Corner className="deco-corner--bl" />
              <Corner className="deco-corner--br" />
            </div>
            <span className="deco-wing deco-wing--left" aria-hidden="true" />
            <span className="deco-wing deco-wing--right" aria-hidden="true" />

            {/* Crest: fan medallion sitting on the top edge */}
            <div className="deco-crest" aria-hidden="true">
              <svg viewBox="-80 -70 160 76" fill="none" focusable="false">
                <path className="deco-crest-bg" d="M-74 4 A74 74 0 0 1 74 4 Z" />
                <path className="deco-draw" pathLength={1} d="M-66 4 A66 66 0 0 1 66 4" />
                <path className="deco-draw deco-draw--thin" pathLength={1} d="M-58 4 A58 58 0 0 1 58 4" />
                <g className="deco-crest-rays">
                  {CREST_RAYS.map((d, i) => (
                    <path key={i} className="deco-draw deco-draw--thin" pathLength={1} d={d} />
                  ))}
                </g>
                <path className="deco-draw" pathLength={1} d="M-30 4 A30 30 0 0 1 30 4" />
              </svg>
              <span className="deco-medallion">
                <MapPin strokeWidth={1.5} />
              </span>
            </div>

            <div className="deco-content">
              <p className="deco-eyebrow deco-rise" style={{ animationDelay: '0.15s' }}>
                <span className="deco-eyebrow-rule" />
                <span className="deco-wordmark">
                  {COMPANY.brand}
                  <span className="deco-wordmark-dot">.</span>
                </span>
                <span className="deco-dot" />
                <span>{tx('Bakım Çalışması', 'Maintenance')}</span>
                <span className="deco-eyebrow-rule" />
              </p>

              <h1 id="deco-title" className="deco-title deco-rise">
                {tx('Bakımdayız', 'Under maintenance')}
              </h1>

              <p className="deco-lede deco-rise" style={{ animationDelay: '0.25s' }}>
                {tx('Kısa bir mola veriyoruz.', 'We are taking a short pause.')}
              </p>

              <div className="deco-divider deco-rise" style={{ animationDelay: '0.3s' }} aria-hidden="true">
                <span className="deco-divider-line">
                  <span className="deco-sheen" />
                </span>
                <svg viewBox="0 0 44 16" focusable="false">
                  <path d="M22 1 L29 8 L22 15 L15 8 Z" fill="#D4AF37" />
                  <path d="M8 8 L12 4 L16 8 L12 12 Z M28 8 L32 4 L36 8 L32 12 Z" fill="none" stroke="#D4AF37" strokeWidth="1" />
                  <path d="M0 8 H6 M38 8 H44" stroke="#D4AF37" strokeWidth="1" />
                </svg>
                <span className="deco-divider-line">
                  <span className="deco-sheen" />
                </span>
              </div>

              <p className="deco-body deco-rise" style={{ animationDelay: '0.35s' }}>
                {tx(
                  'Rango’yu sizin için yeniliyoruz. Randevularınız ve hesabınız güvende; kısa süre içinde daha iyi bir deneyimle yeniden buradayız.',
                  'We are giving Rango a refresh. Your appointments and your account are safe, and we will be back shortly with a better experience.',
                )}
              </p>

              <ul className="deco-assure deco-rise" style={{ animationDelay: '0.4s' }}>
                {assurances.map(({ icon: Icon, label }) => (
                  <li key={label}>
                    <span className="deco-assure-icon" aria-hidden="true">
                      <Icon strokeWidth={1.5} />
                    </span>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>

              <p className="deco-status deco-rise" style={{ animationDelay: '0.45s' }}>
                <span className="deco-status-gem" aria-hidden="true" />
                <span className="deco-status-text">{tx('Anlayışınız için teşekkür ederiz', 'Thank you for your patience')}</span>
                <span className="deco-status-gem" aria-hidden="true" />
              </p>
            </div>
          </section>
        </div>

        <footer className="deco-footer">
          <nav aria-label={tx('Yasal bağlantılar', 'Legal links')} className="deco-links">
            <Link to={legalPath('aydinlatma-metni')}>{tx('KVKK Aydınlatma Metni', 'Privacy Notice (KVKK)')}</Link>
            <span className="deco-sep" aria-hidden="true" />
            <Link to={legalPath('kullanim-kosullari')}>{tx('Kullanım Koşulları', 'Terms of Use')}</Link>
            <span className="deco-sep" aria-hidden="true" />
            <Link to={legalPath('kunye')}>{tx('Künye ve İletişim', 'Company & Contact')}</Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
