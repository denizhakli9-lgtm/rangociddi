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

export const LEGAL_UPDATED_AT = '20 Kasım 2026';

export const LEGAL_VERSIONS = {
  terms: '2026-11-20',
  privacy: '2026-11-20',
  cookies: '2026-11-20',
} as const;

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
  { slug: 'iptal-iade', label: 'İptal ve İade Koşulları', labelEn: 'Cancellation & Refunds' },
  { slug: 'kvkk-basvuru', label: 'KVKK Başvuru', labelEn: 'Data Request (KVKK)' },
  { slug: 'kunye', label: 'Künye ve İletişim', labelEn: 'Company & Contact' },
] as const;

export type LegalSlug = (typeof LEGAL_LINKS)[number]['slug'];

export function legalPath(slug: LegalSlug): string {
  return `/yasal/${slug}`;
}
