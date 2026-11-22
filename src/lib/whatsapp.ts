import { systemLinkClick } from '@/lib/platform';

/**
 * 7/24 WhatsApp destek hattı. Numara değişirse yalnızca burayı güncelleyin.
 *
 * Bilgisayarda müşteri sayfalarının sağ altındaki butonda, mobilde Profil
 * sayfasındaki menüde gösterilir.
 */
export const WHATSAPP_SUPPORT = {
  /** Ekranda gösterilen biçim. */
  display: '+90 535 559 35 62',
  /** wa.me bağlantısı: ülke koduyla, "+" ve boşluk olmadan. */
  url: 'https://wa.me/905355593562',
} as const;

/** Props for an `<a>` that opens the support chat: a new tab on the website, the WhatsApp app inside the mobile app. */
export const whatsAppLinkProps = {
  href: WHATSAPP_SUPPORT.url,
  target: '_blank',
  rel: 'noopener noreferrer',
  onClick: systemLinkClick(WHATSAPP_SUPPORT.url),
} as const;
