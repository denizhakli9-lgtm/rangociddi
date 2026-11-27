import { Link } from 'react-router-dom';
import { Logo } from '@/components/ui/Brand';
import { WhatsAppIcon } from '@/components/WhatsAppSupport';
import { COMPANY, LEGAL_LINKS, PAYMENT_PROVIDER, isPlaceholder, legalPath } from '@/lib/legal';
import { locale, tx } from '@/i18n/locale';
import { siteLinks } from '@/lib/seo/pages/common';
import { newTabClick } from '@/lib/platform';
import { whatsAppLinkProps } from '@/lib/whatsapp';

function ownerName(): string {
  return isPlaceholder(COMPANY.legalName) ? COMPANY.brand : COMPANY.legalName;
}

/** PAYTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 10.3: provider sentence (binding Turkish wording) and a link to its website. */
function PaymentDisclosure({ className = '' }: { className?: string }) {
  return (
    <p lang="tr" className={`leading-relaxed ${className}`}>
      {PAYMENT_PROVIDER.disclosure}{' '}
      <a href={PAYMENT_PROVIDER.website} target="_blank" rel="noopener noreferrer" onClick={newTabClick(PAYMENT_PROVIDER.website)} className="underline underline-offset-2 transition-colors hover:text-white">
        {PAYMENT_PROVIDER.website.replace('https://', '')}
      </a>
    </p>
  );
}

/** Compact footer for narrow screens such as sign-in: the links in two short rows. */
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`border-t border-line-soft pt-6 text-xs text-mist-2 ${className}`}>
      <nav aria-label={tx('Site bağlantıları', 'Site links')} className="flex flex-wrap gap-x-5 gap-y-2 text-mist">
        {siteLinks(locale()).map((l) => (
          <Link key={l.path} to={l.path} className="transition-colors hover:text-white">
            {l.label}
          </Link>
        ))}
      </nav>
      <nav aria-label={tx('Yasal bağlantılar', 'Legal links')} className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((l) => (
          <Link key={l.slug} to={legalPath(l.slug)} className="transition-colors hover:text-white">
            {tx(l.label, l.labelEn)}
          </Link>
        ))}
      </nav>
      <PaymentDisclosure className="mt-4" />
      <p className="mt-2 text-mist-3">© {new Date().getFullYear()} {ownerName()}. {tx('Tüm hakları saklıdır.', 'All rights reserved.')}</p>
    </footer>
  );
}

const columnTitle = 'text-[13px] font-semibold text-white';
const columnLink = 'text-[13px] text-mist transition-colors hover:text-white';

/** The website footer of the customer pages. */
export function SiteFooter() {
  const links = siteLinks(locale());
  return (
    <footer className="border-t border-line-soft pb-24 md:pb-0">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-x-8 gap-y-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
          <div>
            <Logo size="sm" />
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-mist">
              {tx('İzmir’de kuaför, berber ve güzellik işletmeleri için online randevu.', 'Online booking for hair, barber and beauty businesses in İzmir.')}
            </p>
            <a {...whatsAppLinkProps()} className="mt-5 inline-flex items-center gap-2 text-[13px] font-medium text-white transition-colors hover:text-mist">
              <WhatsAppIcon className="h-4 w-4 text-[#1fa855]" />
              {tx('WhatsApp destek', 'WhatsApp support')}
            </a>
          </div>
          <nav aria-label={tx('Site bağlantıları', 'Site links')}>
            <p className={columnTitle}>{tx('Keşfet', 'Explore')}</p>
            <ul className="mt-4 space-y-2.5">
              {links.map((l) => (
                <li key={l.path}>
                  <Link to={l.path} className={columnLink}>{l.label}</Link>
                </li>
              ))}
              <li><Link to="/ara" className={columnLink}>{tx('İşletme ara', 'Search businesses')}</Link></li>
            </ul>
          </nav>
          <nav aria-label={tx('İşletme bağlantıları', 'Business links')}>
            <p className={columnTitle}>{tx('İşletmeler', 'Businesses')}</p>
            <ul className="mt-4 space-y-2.5">
              <li><Link to="/isletmeler-icin" className={columnLink}>{tx('Rango’ya katılın', 'Join Rango')}</Link></li>
              <li><Link to="/kayit" className={columnLink}>{tx('İşletme hesabı oluştur', 'Create a business account')}</Link></li>
              <li><Link to="/giris" className={columnLink}>{tx('İşletme girişi', 'Business sign-in')}</Link></li>
            </ul>
          </nav>
          <nav aria-label={tx('Yasal bağlantılar', 'Legal links')}>
            <p className={columnTitle}>{tx('Yasal', 'Legal')}</p>
            <ul className="mt-4 space-y-2.5">
              {LEGAL_LINKS.map((l) => (
                <li key={l.slug}>
                  <Link to={legalPath(l.slug)} className={columnLink}>{tx(l.label, l.labelEn)}</Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="flex flex-col gap-3 border-t border-line-soft py-6 text-xs text-mist-2 md:flex-row md:items-start md:justify-between md:gap-10">
          <p className="shrink-0 text-mist-3">© {new Date().getFullYear()} {ownerName()}</p>
          <PaymentDisclosure className="md:max-w-2xl md:text-right" />
        </div>
      </div>
    </footer>
  );
}
