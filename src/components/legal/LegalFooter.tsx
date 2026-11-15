import { Link } from 'react-router-dom';
import { COMPANY, LEGAL_LINKS, isPlaceholder, legalPath } from '@/lib/legal';

export function LegalFooter({ className = '' }: { className?: string }) {
  const year = new Date().getFullYear();
  const owner = isPlaceholder(COMPANY.legalName) ? COMPANY.brand : COMPANY.legalName;
  return (
    <footer className={`border-t border-line-soft pt-6 text-xs text-mist-2 ${className}`}>
      <nav aria-label="Yasal bağlantılar" className="flex flex-wrap gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.slug} to={legalPath(l.slug)} className="transition hover:text-white">
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="mt-4 text-mist-3">© {year} {owner}. Tüm hakları saklıdır.</p>
    </footer>
  );
}
