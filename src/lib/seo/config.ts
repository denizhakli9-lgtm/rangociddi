/**
 * Arama motoru ayarları: elle bakılması gereken birkaç karar tek yerde.
 */

/**
 * Deneme işletmeleri: bir sahibi olduğu için uygulamada gerçek işletme gibi davranan, ama
 * gerçekte var olmayan kayıtlar (ör. ödeme testleri için sahiplenilen tohum verisi).
 * Bunlar arama motorlarına gerçek işletme olarak sunulmaz: sayfaları "noindex" olur, yapısal
 * veri (LocalBusiness) üretilmez, sitemap'e ve şehir/semt/kategori listelerine girmezler.
 *
 * Bir deneme işletmesini kaldırdığınızda ya da yenisini açtığınızda bu listeyi güncelleyin
 * (değer, işletme adresindeki `/i/<slug>` kısmıdır).
 */
export const TEST_BUSINESS_SLUGS: ReadonlySet<string> = new Set([
  // "Black Blade Barbershop": tohum verisinden gelen, PayTR testinde kullanılan deneme işletmesi (YAYINLAMA-REHBERI.md).
  'black-blade',
]);

export function isTestBusiness(slug: string | null | undefined): boolean {
  return !!slug && TEST_BUSINESS_SLUGS.has(slug);
}

/**
 * Ödeme altyapısı test modundayken (Yönetim → Ayarlar → Ödeme altyapısı: "Test" ya da
 * "PayTR test") karttan gerçek tahsilat yapılmaz. Bu değer `true` iken kapora anlatılan
 * yerlere bu not eklenir ve Sık Sorulan Sorular'da "test modu" sorusu gösterilir.
 *
 * Site "PayTR canlı"ya geçtiğinde `false` yapıp yeniden yayınlayın.
 */
export const PAYMENTS_IN_TEST_MODE = false;
