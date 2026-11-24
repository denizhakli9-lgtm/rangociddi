import { locale } from '@/i18n/locale';

/**
 * Notifications are written by the database in Turkish. For English visitors the customer
 * notifications are translated on the device: titles are a fixed set, bodies are built from
 * fixed phrases around names, dates and amounts. Anything not recognised (for example a
 * notification added later) is shown as written.
 */
const TITLES: Record<string, string> = {
  'Randevunuz onaylandı': 'Your booking is confirmed',
  'Randevu talebiniz alındı': 'Booking request received',
  'Randevunuz işletme onayı bekliyor': 'Your booking is awaiting approval',
  'Kapora ödemesi alındı': 'Deposit received',
  'Test ödemesi kaydedildi': 'Test payment recorded',
  'Randevunuz iptal edildi': 'Your booking was cancelled',
  'Randevunuz güncellendi': 'Your booking was updated',
  'Randevu talebiniz reddedildi': 'Your booking request was declined',
  'Randevu talebiniz zaman aşımına uğradı': 'Your booking request expired',
  'Deneyiminizi değerlendirin': 'Review your experience',
  'Randevu hatırlatması': 'Booking reminder',
  'Kapora iadeniz onaylandı': 'Your deposit refund was approved',
  'İade talebiniz onaylandı': 'Your refund request was approved',
  'İade talebiniz sonuçlandı': 'Your refund request was decided',
  'Destek ekibinden yeni yanıt': 'New reply from support',
  'İşletmeden yeni mesaj': 'New message from the business',
};

// Applied in order; each turns one fixed Turkish phrase into English.
const BODY_RULES: [RegExp, string][] = [
  [/^([\d.,\s]+) ₺ kapora ödemeniz başarıyla alındı\.$/, 'Your ₺$1 deposit payment was received.'],
  [/^([\d.,\s]+) ₺ kapora test modunda kaydedildi\. Kartınızdan herhangi bir tahsilat yapılmadı\.$/, '₺$1 deposit recorded in test mode. Nothing was charged to your card.'],
  [/^([\d.,\s]+) ₺ iadeniz kartınıza gönderildi\. Bankanıza bağlı olarak hesabınıza yansıması birkaç gün sürebilir\.$/, 'Your ₺$1 refund has been sent to your card. Depending on your bank, it may take a few days to appear.'],
  [/^([\d.,\s]+) ₺ kapora test modunda alındığı için kartınızdan herhangi bir tahsilat yapılmamıştı\. İade kaydınız kapatıldı\.$/, 'The ₺$1 deposit was taken in test mode, so nothing was charged to your card. Your refund record has been closed.'],
  [/^(.+) ziyaretiniz nasıldı\? Yorumunuzu paylaşın\.$/, 'How was your visit to $1? Share your review.'],
  [/^İptal politikası süresi geçtiği için kapora iade edilmeyecektir\.$/, 'The deposit will not be refunded because the cancellation window had passed.'],
  [/^İade talebiniz onaylanmadı\./, 'Your refund request was not approved.'],
  [/^Destek konuşmana yeni bir yanıt geldi\.$/, 'There is a new reply in your support conversation.'],
  [/^(.+), ([\d.]+ [\d:]+) randevunuz için yeni bir mesajınız var\.$/, '$1, $2: you have a new message about your booking.'],
  [/ randevunuz iptal edildi\. Bu işletme platformdaki örnek kayıtlardan biridir ve randevu kabul etmemektedir\./, ': your booking was cancelled. This is a sample business on the platform and does not take bookings.'],
  [/ randevu talebiniz başlangıç saatine kadar onaylanmadığı için iptal edildi\./, ': your booking request was cancelled because it was not approved before the start time.'],
  [/ randevunuz Rango tarafından iptal edildi\./, ': your booking was cancelled by Rango.'],
  [/^(.+) randevunuzu onaylayamadı\./, '$1: the business could not accept your booking.'],
  [/^(.+) randevunuz iptal edildi\.$/, 'Your booking at $1 was cancelled.'],
  [/ - yeni tarih: /, ' - new date: '],
  [/\. Randevunuz işletme onayından sonra kesinleşir\./, '. Your booking is final once the business approves it.'],
  [/\. Aynı gün randevuları işletme onayından sonra kesinleşir\./, '. Same-day bookings are final once the business approves them.'],
  [/ ?Kapora iadeniz işleme alındı\./, ' Your deposit refund is being processed.'],
  [/ Not: /, ' Note: '],
];

export function notificationTitle(title: string): string {
  if (locale() !== 'en') return title;
  return TITLES[title] ?? title;
}

export function notificationBody(body: string): string {
  if (locale() !== 'en' || !body) return body;
  return BODY_RULES.reduce((text, [re, to]) => text.replace(re, to), body).trim();
}
