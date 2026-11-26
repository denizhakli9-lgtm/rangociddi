/**
 * Veri sorumlusu ve yasal metin ayarları.
 *
 * YAYINA ALMADAN ÖNCE: `COMPANY` içindeki köşeli parantezli tüm alanları
 * gerçek şirket bilgilerinizle doldurun. Bu bilgiler Aydınlatma Metni,
 * Kullanım Koşulları, Çerez Politikası, İptal/İade Koşulları, Başvuru
 * Formu ve site künyesinde otomatik olarak kullanılır.
 *
 * Bir metni esaslı şekilde değiştirdiğinizde ilgili sürümü (`LEGAL_VERSIONS`)
 * ve `LEGAL_UPDATED_AT` tarihini güncelleyin; yeni kayıtlar kabul ettikleri
 * sürümle birlikte saklanır.
 */
export const COMPANY = {
  /** Ticari unvan (şahıs işletmesiyse ad soyad + işletme adı). */
  legalName: 'Rango Bilgisayar ve Yazılım Şirketi',
  /** Uygulamanın marka adı. */
  brand: 'Rango',
  /** Açık adres (mahalle, cadde/sokak, no, ilçe/il). */
  address: 'Karabağlar / İzmir',
  /** Vergi kimlik numarası. */
  taxNumber: '2930362722',
  /** MERSİS numarası (16 hane, varsa). Boş bırakılırsa gösterilmez. */
  mersis: '',
  /** Vergi dairesi. Boş bırakılırsa gösterilmez. */
  taxOffice: '',
  /** Ticaret sicil müdürlüğü ve sicil numarası (varsa). Boş bırakılırsa gösterilmez. */
  tradeRegistry: '',
  /** Genel iletişim e-postası. */
  email: 'deniz.dev@rango.com.tr',
  /** KVKK başvuruları için e-posta adresi. */
  kvkkEmail: 'deniz.dev@rango.com.tr',
  /** Kayıtlı Elektronik Posta (KEP) adresi (varsa). Boş bırakılırsa gösterilmez. */
  kep: '',
  /** Müşteri hizmetleri telefonu. Boş bırakılırsa gösterilmez. */
  phone: '',
  /** Web sitesi. */
  website: 'https://rango.com.tr',
  /** VERBİS kayıt numarası (kayıt yükümlülüğü varsa). Boş bırakılırsa gösterilmez. */
  verbis: '',
} as const;

export const LEGAL_UPDATED_AT = '26 Kasım 2026';

/**
 * Sürüm biçimi `YYYY-AA-GG` (yayın tarihi; ileri bir tarih yazmayın). Aynı gün ikinci bir değişiklik için
 * `YYYY-AA-GG.2` … `.9` kullanılır. Başka biçimler derlemede (typecheck) hata verir; `sale` için veritabanı da
 * reddeder ve satış onayı kaydedilemediği için hiçbir ödeme tamamlanamaz.
 */
type LegalVersion = `${number}-${number}-${number}`;

export const LEGAL_VERSIONS = {
  terms: '2026-11-26',
  privacy: '2026-11-26',
  cookies: '2026-11-20',
  /**
   * Ödeme ekranında birlikte kabul edilen metinlerin ortak sürümü: Mesafeli Hizmet Satış Sözleşmesi,
   * İptal ve İade Koşulları, ön bilgilendirme ve satış onayı cümleleri (`SALE_CONSENT_TEXT*`). Bunlardan
   * biri esaslı şekilde değişirse bu sürüm de değişmelidir; her satış onayı bu sürümle birlikte saklanır.
   */
  sale: '2026-11-20',
} as const satisfies Record<string, LegalVersion>;

/**
 * Lisanslı ödeme kuruluşu. PAYTR Çerçeve Ödeme Hizmeti Sözleşmesi md. 10.3 uyarınca
 * `disclosure` cümlesi sitede duyurulmalı ve `website` adresine bağlantı verilmelidir.
 */
export const PAYMENT_PROVIDER = {
  name: 'PAYTR Ödeme ve Elektronik Para Kuruluşu A.Ş.',
  shortName: 'PAYTR',
  website: 'https://www.paytr.com',
  disclosure: 'Bu internet sitesinde/uygulamadaki ödeme hizmetleri PAYTR Ödeme ve Elektronik Para Kuruluşu A.Ş. tarafından sağlanmaktadır.',
} as const;

/**
 * Ödeme ekranındaki satış onayı metni (PAYTR sözleşmesi md. 7.2: ödemenin müşteri onayıyla
 * yapıldığını ispat yükü bizdedir). Metin değişirse `LEGAL_VERSIONS.sale` sürümünü güncelleyin.
 * Hangi metnin gösterildiği kayıttan anlaşılır: `payment_mode` 'test' ise `_TEST`, değilse asıl metin;
 * `consent_locale` 'en' ise İngilizcesi.
 */
export const SALE_CONSENT_TEXT = `Ön bilgilendirme bilgilerini, Mesafeli Hizmet Satış Sözleşmesi’ni ve İptal ve İade Koşulları’nı okudum, kabul ediyorum. Gösterilen kapora tutarının, hizmet sağlayıcı işletme adına ve hesabına ${COMPANY.brand} aracılığıyla ${PAYMENT_PROVIDER.name} üzerinden kartımdan tahsil edilmesine onay vererek satışı onaylıyorum.`;
export const SALE_CONSENT_TEXT_EN = `I have read and accept the pre-contract information, the Distance Service Sales Agreement and the Cancellation & Refund Policy. I authorise the deposit shown to be charged to my card in the name and on behalf of the service provider, through ${COMPANY.brand} and ${PAYMENT_PROVIDER.name}, and I confirm the purchase.`;

/** Platform test modunda (ödeme kuruluşuna işlem gönderilmez, karttan tahsilat yapılmaz) gösterilen satış onayı. */
export const SALE_CONSENT_TEXT_TEST =
  'Ön bilgilendirme bilgilerini, Mesafeli Hizmet Satış Sözleşmesi’ni ve İptal ve İade Koşulları’nı okudum, kabul ediyorum. Platformun test modunda olduğunu, kartımdan herhangi bir tutar tahsil edilmeyeceğini ve hizmet bedelinin tamamını işletmede ödeyeceğimi bilerek satışı onaylıyorum.';
export const SALE_CONSENT_TEXT_TEST_EN =
  'I have read and accept the pre-contract information, the Distance Service Sales Agreement and the Cancellation & Refund Policy. I understand that the platform is in test mode, that nothing will be charged to my card and that I will pay the full price at the business, and I confirm the purchase.';

/** True while a company field still contains a "[...]" placeholder. */
export function isPlaceholder(value: string): boolean {
  return /^\[.*\]$/.test(value.trim());
}

export function hasPlaceholders(): boolean {
  return Object.values(COMPANY).some((v) => isPlaceholder(v));
}

/** A company field that should be shown (filled in, not left empty). */
export function filled(value: string): boolean {
  return value.trim().length > 0;
}

export const LEGAL_LINKS = [
  { slug: 'aydinlatma-metni', label: 'KVKK Aydınlatma Metni', labelEn: 'Privacy Notice (KVKK)' },
  { slug: 'kullanim-kosullari', label: 'Kullanım Koşulları', labelEn: 'Terms of Use' },
  { slug: 'cerez-politikasi', label: 'Çerez Politikası', labelEn: 'Cookie Policy' },
  { slug: 'satis-sozlesmesi', label: 'Mesafeli Hizmet Satış Sözleşmesi', labelEn: 'Distance Service Sales Agreement' },
  { slug: 'iptal-iade', label: 'İptal ve İade Koşulları', labelEn: 'Cancellation & Refunds' },
  { slug: 'kvkk-basvuru', label: 'KVKK Başvuru', labelEn: 'Data Request (KVKK)' },
  { slug: 'hesap-silme', label: 'Hesap Silme', labelEn: 'Account Deletion' },
  { slug: 'kunye', label: 'Künye ve İletişim', labelEn: 'Company & Contact' },
] as const;

export type LegalSlug = (typeof LEGAL_LINKS)[number]['slug'];

export function legalPath(slug: LegalSlug): string {
  return `/yasal/${slug}`;
}
