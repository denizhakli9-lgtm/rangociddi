/**
 * WhatsApp destek hattı. Numara değişirse yalnızca burayı güncelleyin.
 *
 * Saf veridir (import yok): hem uygulama (`whatsapp.ts`) hem de statik içerik sayfaları
 * (`src/lib/seo/pages`) aynı numarayı buradan alır.
 */
export const WHATSAPP_SUPPORT = {
  /** Ekranda gösterilen biçim. */
  display: '+90 535 559 35 62',
  /** wa.me bağlantısı: ülke koduyla, "+" ve boşluk olmadan. */
  url: 'https://wa.me/905355593562',
} as const;

/** Chat link; `message` is pre-filled in WhatsApp's message box (the user still presses send). */
export function whatsAppUrl(message?: string): string {
  return message ? `${WHATSAPP_SUPPORT.url}?text=${encodeURIComponent(message)}` : WHATSAPP_SUPPORT.url;
}
