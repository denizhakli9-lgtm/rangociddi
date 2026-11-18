import { Link } from 'react-router-dom';
import { COMPANY, LEGAL_LINKS, isPlaceholder, legalPath } from '@/lib/legal';
import { tx } from '@/i18n/locale';

export function LegalFooter({ className = '' }: { className?: string }) {
  const year = new Date().getFullYear();
  const owner = isPlaceholder(COMPANY.legalName) ? COMPANY.brand : COMPANY.legalName;
  return (
    <footer className={`border-t border-line-soft pt-6 text-xs text-mist-2 ${className}`}>
      <nav aria-label={tx('Yasal bağlantılar', 'Legal links')} className="flex flex-wrap gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.slug} to={legalPath(l.slug)} className="transition hover:text-white">
            {tx(l.label, l.labelEn)}
          </Link>
        ))}
      </nav>
      <p className="mt-4 text-mist-3">© {year} {owner}. {tx('Tüm hakları saklıdır.', 'All rights reserved.')}</p>
    </footer>
  );
}
