import { systemLinkClick } from '@/lib/platform';

/**
 * 7/24 WhatsApp destek hattı. Numara değişirse yalnızca burayı güncelleyin.
 *
 * Bilgisayarda müşteri sayfalarının ve işletme panelinin sağ altındaki butonda;
 * mobilde Profil sayfasında ve işletme panelinin menüsünde gösterilir.
 */
export const WHATSAPP_SUPPORT = {
  /** Ekranda gösterilen biçim. */
  display: '+90 535 559 35 62',
  /** wa.me bağlantısı: ülke koduyla, "+" ve boşluk olmadan. */
  url: 'https://wa.me/905355593562',
} as const;

/** İşletme panelinden açılan sohbette mesaj kutusuna hazır gelen metin. */
export function businessSupportMessage(businessName: string): string {
  return `Merhaba ${businessName.trim()} işletmesinden yazıyorum, yardıma ihtiyacım var.`;
}

/** Chat link; `message` is pre-filled in WhatsApp's message box (the user still presses send). */
export function whatsAppUrl(message?: string): string {
  return message ? `${WHATSAPP_SUPPORT.url}?text=${encodeURIComponent(message)}` : WHATSAPP_SUPPORT.url;
}

/** Props for an `<a>` that opens the support chat: a new tab on the website, the WhatsApp app inside the mobile app. */
export function whatsAppLinkProps(message?: string) {
  const href = whatsAppUrl(message);
  return { href, target: '_blank', rel: 'noopener noreferrer', onClick: systemLinkClick(href) } as const;
}
