import { systemLinkClick } from '@/lib/platform';

import { WHATSAPP_SUPPORT, whatsAppUrl } from '@/lib/contact';

/**
 * 7/24 WhatsApp destek hattı (numara: src/lib/contact.ts).
 *
 * Bilgisayarda müşteri sayfalarının ve işletme panelinin sağ altındaki butonda;
 * mobilde Profil sayfasında ve işletme panelinin menüsünde gösterilir.
 */
export { WHATSAPP_SUPPORT, whatsAppUrl };

/** İşletme panelinden açılan sohbette mesaj kutusuna hazır gelen metin. */
export function businessSupportMessage(businessName: string): string {
  return `Merhaba ${businessName.trim()} işletmesinden yazıyorum, yardıma ihtiyacım var.`;
}

/** Props for an `<a>` that opens the support chat: a new tab on the website, the WhatsApp app inside the mobile app. */
export function whatsAppLinkProps(message?: string) {
  const href = whatsAppUrl(message);
  return { href, target: '_blank', rel: 'noopener noreferrer', onClick: systemLinkClick(href) } as const;
}
