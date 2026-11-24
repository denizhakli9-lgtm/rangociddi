import { Link } from 'react-router-dom';
import { COMPANY, LEGAL_LINKS, PAYMENT_PROVIDER, isPlaceholder, legalPath } from '@/lib/legal';
import { locale, tx } from '@/i18n/locale';
import { siteLinks } from '@/lib/seo/pages/common';
import { newTabClick } from '@/lib/platform';

export function LegalFooter({ className = '' }: { className?: string }) {
  const year = new Date().getFullYear();
  const owner = isPlaceholder(COMPANY.legalName) ? COMPANY.brand : COMPANY.legalName;
  return (
    <footer className={`border-t border-line-soft pt-6 text-xs text-mist-2 ${className}`}>
      <nav aria-label={tx('Site bağlantıları', 'Site links')} className="flex flex-wrap gap-x-5 gap-y-2 text-mist">
        {siteLinks(locale()).map((l) => (
          <Link key={l.path} to={l.path} className="transition hover:text-white">
            {l.label}
          </Link>
        ))}
      </nav>
      <nav aria-label={tx('Yasal bağlantılar', 'Legal links')} className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.slug} to={legalPath(l.slug)} className="transition hover:text-white">
            {tx(l.label, l.labelEn)}
          </Link>
        ))}
      </nav>
      {/* PAYTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 10.3: provider sentence (binding Turkish wording) and a link to its website. */}
      <p lang="tr" className="mt-4 leading-relaxed">
        {PAYMENT_PROVIDER.disclosure}{' '}
        <a href={PAYMENT_PROVIDER.website} target="_blank" rel="noopener noreferrer" onClick={newTabClick(PAYMENT_PROVIDER.website)} className="underline underline-offset-2 transition hover:text-white">
          {PAYMENT_PROVIDER.website.replace('https://', '')}
        </a>
      </p>
      <p className="mt-2 text-mist-3">© {year} {owner}. {tx('Tüm hakları saklıdır.', 'All rights reserved.')}</p>
    </footer>
  );
}
