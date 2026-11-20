# Rango – Yayınlama Rehberi

Bu paket; bağımlılık güvenlik açıkları kapatılmış, güvenlik ve hata düzeltmeleri yapılmış, KVKK uyum ekranları eklenmiş Rango uygulamasıdır.
Aşağıdaki adımları **sırayla** uygulayın.

---

## 1. Hostinger'a yükleme (site kodu)

> **Not (20 Kasım 2026):** `rango.com.tr` gün içinde hem Netlify (Bolt'un yayınlama özelliği) hem Hostinger üzerinden sunuldu; akşam itibarıyla yanıt başlığında `platform: hostinger` görünüyor. Siteyi hangisinin sunduğunu `curl -sI https://rango.com.tr/` ile kontrol edin. Netlify/Bolt kullanılıyorsa `main`'e birleştirmek siteyi kendiliğinden güncellemez; önce Bolt'taki projeyi son `main` ile güncelleyip Bolt'tan yayınlayın.

1. hPanel → **Web Siteleri → rango.com.tr → Node.js** bölümüne girin.
2. Bu zip dosyasını yükleyin ve **Ayarlar ve yeniden dağıtma** ile yeniden dağıtın.
3. Derleme ayarları:
   - Çerçeve: **Vite**
   - Derleme komutu: `npm run build`
   - Çıktı klasörü: `dist`
   - Node sürümü: **22.x** (en az 20.19)
   - Kök dizin (Root directory): **boş** ya da `/` (depo kökü). Bu alan yalnızca uygulama oluşturulurken (içe aktarılırken) seçilebilir.

   > **Git ile dağıtım notu:** Kök dizin `.bolt` olarak kalırsa `.bolt/package.json` köprüsü devreye girer: Hostinger derlemeyi `.bolt` içinde başlattığında asıl projeyi depo kökünde kurup derler ve çıktıyı `.bolt/dist` klasörüne koyar. Kalıcı çözüm, uygulamayı kök dizin boş (ya da `/`) olacak şekilde GitHub'dan yeniden içe aktarmaktır.
   >
   > - Supabase ayarları şu sırayla okunur: `.env` dosyası ya da `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` ortam değişkenleri → Hostinger'ın "Veritabanı bağla → Supabase" sihirbazının yazdığı `SUPABASE_URL` + `SUPABASE_ANON_KEY` → `vite.config.ts` içindeki varsayılan (herkese açık) değerler. Adres ve anahtar her zaman birlikte verilmelidir; gizli (`service_role` / `sb_secret_`) anahtar verilirse derleme durur.
   > - Varsayılan anahtar Supabase'in eski (legacy) anon anahtarıdır ve Supabase'e göre 2026 sonunda çalışmayı bırakır. Yeni `sb_publishable_` anahtarına geçerken Bolt'taki `.env` dosyasını ve `vite.config.ts` içindeki varsayılanı birlikte güncelleyin.
   > - Köprü kullanılırken Hostinger'ın güvenlik taraması yalnızca bağımlılığı olmayan `.bolt` klasörünü görür. Gerçek bağımlılıkların `npm audit` özeti derleme günlüğünün sonunda yer alır.

4. Dağıtımdan sonra kontrol edin:
   - Güvenlik taraması (Vulnerabilities) **0 açık** göstermeli (köprü kullanılıyorsa derleme günlüğündeki `npm audit` özetine bakın).
   - `https://rango.com.tr/kesfet` sayfasını açıp **yenileyin**; 404 vermemeli.
   - `https://rango.com.tr/yasal/aydinlatma-metni` açılmalı.

> `public/.htaccess` dosyası HTTPS yönlendirmesi, sayfa yenilemede 404 vermemesi ve güvenlik başlıklarını (CSP, HSTS, X-Frame-Options vb.) sağlar.
> Eğer derin bir sayfayı yenilediğinizde 404 alırsanız, Hostinger panelinde "SPA / tüm istekleri index.html'e yönlendir" seçeneğini açın.

---

## 2. Veritabanı güvenlik güncellemesi (Supabase) – ✅ YAPILDI (15 Kasım 2026)

Bu adım Supabase bağlantısı üzerinden sizin yerinize uygulandı; **tekrar çalıştırmanıza gerek yok.**
Uygulanan dosyalar (Supabase'in migration listesinde de kayıtlı):
- `supabase/migrations/20261114200000_rango_security_hardening.sql`
- `supabase/migrations/20261115090000_restore_explicit_anonymous_checks.sql` (Supabase güvenlik taramasının uyarısını gideren küçük ek)

Yapılan kontroller:
- Uygulamadan önce: yönetici hesabı var; canlı veritabanı önceki 30 migration ile birebir aynıydı (elle yapılmış değişiklik yoktu).
- Uygulamadan sonra: tablolar, kurallar (RLS), izinler ve fonksiyonlar test veritabanındaki beklenen sonuçla birebir aynı.
- pg_cron açıldı; `rango-expire-stale-bookings` (5 dakikada bir) ve `rango-retention` (her gece) görevleri kuruldu.
- Supabase güvenlik taramasında yalnızca pg_cron'un kendi tabloları (`cron.job`, `cron.job_run_details`) için uyarı kalır. Bu tablolara siteden erişim yoktur, görmezden gelebilirsiniz.

Sizin yapmanız gereken tek şey: bir deneme müşteri hesabı açıp **Profil → Hesabımı sil** ile hesap silmeyi bir kez denemek (gerçek veya yönetici hesabıyla denemeyin).

Bu güncelleme şunları yaptı:
- **Örnek (demo) işletmeler:** Görünmeye devam eder ama randevu almaz. Uydurma telefon ve e-postaları silinir, aktif randevuları iptal edilir.
- **Aynı gün randevular:** Her zaman işletme onayına düşer. Başlangıç saati geçen ve hâlâ cevaplanmamış talepler otomatik reddedilir, kapora iadesi açılır.
- **Takvim kilitleme:** Bir hesabın sınırsız sahte randevuyla takvim doldurması engellenir (`VEYRA_LIMIT`).
- **İptal süresi:** Randevu alındığı anda sabitlenir. İşletme sonradan değiştirse de müşteri, randevuyu aldığı andaki kurala tabi olur.
- **Askıya alınan hesaplar:** Randevu ve işletme işlemi yapamaz.
- **Destek yapay zekâsı:** Kullanım kotası eklenir (kişi başı ve toplam). KVKK başlıklı talepler sadece yöneticilere görünür.
- **KVKK hesap silme:** `delete_my_account` fonksiyonu eklenir.
- **İlk yönetici kurulumu:** Doğrulanmış e-posta şartı getirilir; yönetici belirlendikten sonra kurulum kapatılır.
- **Fotoğraf deposu:** İşletme görsellerinin herkes tarafından listelenmesi kapatılır.
- **Müşteri bilgileri:** İşletmeler sadece gerçekten randevu almış müşterilerini görür.
- **Test ödemeleri:** Bildirimlerde "kartınızdan tahsilat yapılmadı" yazar.
- **Saklama süresi:** Notlar 12 ay sonra, kapanmış destek yazışmaları 2 yıl sonra temizlenir (pg_cron açıksa).

---

## 3. Destek yapay zekâ fonksiyonu (Supabase Edge Function) – ✅ YAPILDI (15 Kasım 2026)

Dosya: `supabase/functions/support-ai/index.ts`. Supabase bağlantısı üzerinden **v4** olarak yayınlandı (giriş kontrolü `verify_jwt` açık).
Yayındaki kodun bu dosyayla birebir aynı olduğu doğrulandı ve fonksiyonun çalıştığı test edildi. Tekrar yayınlamanıza gerek yok.
İleride kodu değiştirirseniz `supabase functions deploy support-ai` ile (veya Bolt üzerinden) yeniden yayınlayın.

- `OPENAI_API_KEY` tanımlı değilse tüm destek mesajları doğrudan temsilciye gider; yurt dışına veri aktarımı olmaz.
- **Öneri:** OpenAI ile KVKK standart sözleşmesi imzalanıp Kurum'a bildirilene kadar `OPENAI_API_KEY`'i tanımlamayın.
- Anahtarı tanımlarsanız OpenAI panelinden **aylık harcama limiti** koyun.

---

## 4. Supabase kimlik doğrulama ayarları

**Authentication → Sign In / Providers / URL Configuration** altında:
- **Confirm email:** açık
- **Secure password change:** açık
- **Leaked password protection:** açık
- **Site URL:** `https://rango.com.tr`
- **Redirect URLs:** `https://rango.com.tr/giris` ve `https://rango.com.tr/sifre-yenile`
- Yönetici hesapları için iki adımlı doğrulamayı (**MFA / TOTP**) açmanız önerilir.

---

## 5. KVKK – kod dışında yapmanız gerekenler

Kod tarafındaki uyum ekranları hazır: aydınlatma metni, kullanım koşulları, çerez politikası, iptal/iade, KVKK başvuru, künye, veri indirme ve hesap silme. Ancak aşağıdakiler **sizin** tarafınızdan yapılmalıdır:

1. **Yurt dışı aktarım (KVKK md. 9):** Supabase, Hostinger ve OpenAI (açarsanız) ile Kurul'un ilan ettiği **standart sözleşmeyi** imzalayın ve imzadan sonra **5 iş günü içinde Kurum'a bildirin**. Aydınlatma metni bu sözleşmelerin yapılmış olmasını varsayar.
2. **VERBİS:** Kayıt yükümlülüğünüzü değerlendirin. Kayıt olursanız numarayı `src/lib/legal.ts` → `verbis` alanına yazın.
3. **Kişisel veri saklama ve imha politikası** ile **veri ihlali müdahale planı** hazırlayın. İhlali 72 saat içinde Kurul'a bildirme yükümlülüğü vardır.
4. **İşletmelerle** ayrı bir hizmet sözleşmesi yapın. Kullanım koşullarına temel hükümler eklendi; kapsamlı bir sözleşme önerilir.
5. **Erişim kayıtları (5651):** Supabase ve Hostinger log saklama sürelerini kontrol edin.
6. Yasal metinleri yayına almadan önce bir **avukata kontrol ettirin**.
7. Şirket bilgileri `src/lib/legal.ts` dosyasındadır:
   - Unvan vergi levhasındakiyle **birebir** aynı olmalı (ör. "… Ltd. Şti.").
   - Açık adres eksiksiz yazılmalı.
   - KEP adresi varsa eklenmeli.
   - Telefon eklenmeli.

---

## 6. Ödeme – PayTR iFrame API (20 Kasım 2026)

Kaporalar **PayTR iFrame API** ile alınır. Müşteri kart bilgisini PayTR'nin güvenli ödeme sayfasına girer; kart bilgisi Rango'ya hiç gelmez. Ödeme yalnızca PayTR'nin sunucudan sunucuya gönderdiği bildirimle (ya da PayTR durum sorgusuyla) onaylanır.

**Kurulu olanlar (Supabase'e yüklendi):**
- Edge Function'lar: `paytr-token` (ödeme sayfası), `paytr-callback` (PayTR Bildirim URL), `paytr-status` (PayTR durum sorgusu ile yedek kontrol), `paytr-refund` (admin iadesi PayTR'ye gider).
- Gizli anahtarlar Supabase → Edge Functions → Secrets altında: `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT`. Kodda veya GitHub'da **yoktur**.
- Veritabanı: `supabase/migrations/20261120095952_paytr_iframe_payments.sql`, `20261120104422_paytr_refunds_reconcile_admin_mode.sql`, `20261120110336_paytr_testers.sql`, `20261120111919_paytr_review_fixes.sql`, `20261120112728_paytr_security_fixes.sql`, `20261120113849_paytr_protocol_fixes.sql`.
- İzleme: `rango-paytr-notification-health` (pg_cron, 10 dakikada bir). Bir ödeme yalnızca durum sorgusuyla onaylanıp PayTR'nin bildirimi 15 dakika içinde gelmezse adminlere "PayTR bildirimi ulaşmıyor" bildirimi gider (Bildirim URL'yi kontrol edin).
- Site: ödeme sayfası (sitede iframe, uygulamada uygulama içi tarayıcı), admin **Ayarlar → Ödeme altyapısı** ile mod değiştirme, admin **İadeler** ekranında PayTR iadesi.

**Ödeme modları (Yönetim → Ayarlar → Ödeme altyapısı):**
- **Test (kartsız):** Eski test akışı, hiçbir ödeme kuruluşuna bağlanılmaz.
- **PayTR test:** Müşteri PayTR sayfasına gider, PayTR test modundadır; test kartı sayfada hazır gelir ("Ödeme Yap" → 3D sayfasında "Gönder"). Gerçek tahsilat yoktur.
- **PayTR canlı:** Gerçek tahsilat. Yalnızca PayTR mağazanız canlıya alındıktan sonra açın.

**Sizin yapmanız gerekenler (PayTR paneli):**
1. **Bildirim URL (zorunlu):** PayTR Mağaza Paneli → Destek & Kurulum → Ayarlar → Bildirim URL:
   `https://ocgqkdhrmjesrbksnrlh.supabase.co/functions/v1/paytr-callback`
   Bu girilmezse PayTR ödemeyi "Devam Ediyor" olarak bekletir: para mağaza hesabınıza aktarılmaz ve iade yapılamaz (PayTR hata 007).
2. Site "PayTR test" modundayken bir test ödemesi yapın. PayTR panelinde İşlem & Rapor → İşlemler sayfasında işlemin "Başarılı" göründüğünü kontrol edin ("Devam Ediyor" görünüyorsa Bildirim URL'yi kontrol edin).
3. Canlıya geçiş: PayTR panelinde Destek & Kurulum → Canlı Mod → "Evet, Entegrasyonu Tamamladım" → "Canlı Moda Geçiş Talebi Gönder".
4. PayTR'den canlı mod SMS/e-postası gelince Yönetim → Ayarlar → Ödeme altyapısı → **PayTR canlı**.

**Test edildi (20 Kasım 2026, PayTR test modu):** ödeme sayfası, test kartıyla ödeme, PayTR bildirimiyle randevu onayı (birkaç saniye), müşteri iptali → otomatik iade talebi, admin iadesinin PayTR İade API ile gönderilmesi, PayTR durum sorgusu ve sitede iframe içinden ödeme (PayTR ödeme sonrası ana pencereyi `odeme-sonuc.html` sayfasına yönlendirir, o da müşteriyi ödeme sayfasına geri getirir).

**Test hesapları:** Platform "Test (kartsız)" modundayken bile belirli hesaplar PayTR'yi (her zaman PayTR test modunda) kullanabilir: `INSERT INTO private.paytr_testers (user_id) VALUES ('<kullanıcı id>');` Silmek için `DELETE FROM private.paytr_testers WHERE user_id = '<kullanıcı id>';`

**İadeler:** Yönetim → İadeler ekranında PayTR ile alınmış bir ödemenin iadesini onayladığınızda tutar PayTR üzerinden karta gönderilir. PayTR iadeyi mağaza bakiyenizden yapar; bakiye yetersizse (hata 010) iade reddedilir ve ekranda PayTR'nin mesajı görünür. Aynı iade iki kez gönderilmez.

**Önemli – pazaryeri modeli:** Rango kaporayı işletmeler adına tahsil ediyor. Standart PayTR mağazasında para yalnızca vergi levhasındaki hesaba (Rango'ya) ödenir. İşletmelere ödeme dağıtmak için PayTR'nin **Pazaryeri çözümü** (Platform Transfer) veya TCMB lisansı gerekebilir. Canlıya geçmeden PayTR temsilcinize ve bir hukukçuya danışın.

### Satış onayı (PayTR sözleşmesi md. 7.2, 6.4, 7.3, 10.3)

**Ne yapar:**
- Ödeme ekranında müşteri **satış onayı** kutusunu işaretlemeden ödeme başlatılamaz (ne test ödemesi ne de PayTR ödeme sayfası).
- Onay; sözleşme sürümü, dili, gösterilen onay cümlesi (test ya da gerçek) ve onay anındaki ön bilgilendirme bilgileriyle (işletme adı ve adresi, hizmet, uzman, tarih, tutarlar, iptal süresi) `sale_consents` tablosuna kaydedilir. Her onay ayrı satırdır; müşteri tekrar onaylarsa önceki kayıt silinmez. Kayıtlar 10 yıl saklanır; sitede ve servis anahtarıyla elle değiştirilemez.
- Aşağıdaki 2. adım uygulandıktan sonra `pay_deposit` ve PayTR siparişleri, onay kaydı olmayan ödemeyi başlatmaz.
- Sözleşme metni: `/yasal/satis-sozlesmesi`. İptal ve İade Koşulları ile birlikte kabul edilir.
- Site altbilgisinde ve ödeme ekranında PayTR cümlesi ve www.paytr.com bağlantısı gösterilir (md. 10.3).
- Müşterinin "Verilerimi indir" dosyasında kendi satış onayları da yer alır.

**Metin değişirse:** Satış sözleşmesi, İptal ve İade Koşulları, ödeme ekranındaki ön bilgilendirme (`src/pages/customer/booking/Payment.tsx` → `PreContractInfo`) ya da onay cümleleri (`SALE_CONSENT_TEXT*`) esaslı şekilde değişirse `src/lib/legal.ts` → `LEGAL_VERSIONS.sale` değerini yayın tarihiyle `YYYY-AA-GG` biçiminde güncelleyin (ör. `2026-12-01`; aynı gün ikinci bir değişiklik için `2026-12-01.2`). İleri bir tarih yazmayın. Başka biçimde yazılan sürümde derleme durur (`vite.config.ts`); veritabanı da reddeder, çünkü öyle bir sürümle satış onayı kaydedilemez ve hiçbir ödeme tamamlanamaz.

**Veritabanı güncellemesi üç adımdır ve sıra önemlidir.** Dosyaları tek tek Supabase bağlantısıyla (migration olarak) uygulayın; böylece sürüm numarası kaydedilir ve dosya adı o numarayla eşitlenir. SQL Editor'de çalıştırırsanız sürüm kaydı oluşmaz; o durumda dosyayı çalıştırdığınız anın damgasıyla (YYYYAAGGSSDDss, UTC) adlandırın. `supabase db push` kullanmayın: bekleyen bütün dosyaları birlikte uygular.
1. `supabase/migrations/20261120155246_record_sale_consent.sql` (onay tablosu ve kayıt fonksiyonu) — ✅ 20 Kasım 2026'da canlıya uygulandı (sürüm 20261120155246).
1b. `supabase/bekleyen/sale_consents_append_only.sql` (her onay ayrı kayıt, gösterilen onay cümlesi). Canlıdaki ön yüzle uyumludur ve p_wording gönderen yeni ön yüz yayınlanmadan **önce** uygulanmalıdır; yoksa yeni ön yüzde satış onayı kaydedilemez ve ödeme başlamaz. Uyguladıktan sonra dosyayı kaydedilen sürümle `supabase/migrations/` klasörüne taşıyın. Kontrol sorgusu `true` döndürmeli:
   `select to_regprocedure('public.record_sale_consent(uuid,text,text,text)') is not null and to_regprocedure('public.record_sale_consent(uuid,text,text)') is null;`
2. `supabase/bekleyen/require_sale_consent_for_payment.sql` (onaysız ödemeyi reddetme). 1b'den sonra ve aşağıdakilerin **hepsi** doğrulandıktan sonra uygulanır. Erken uygulanırsa eski kodla açılmış ödeme ekranlarında ödemeler "Bir sorun oluştu" hatasıyla durur.
   - Site satış onayını içeren kodla yayında: site Hostinger'dan sunuluyorsa (yanıtta `platform: hostinger`) hPanel → Node.js'teki son derleme başarılı olmalı; Netlify/Bolt'tan sunuluyorsa Bolt'taki proje son `main`'i içermeli ve yayınlanmış olmalı. Yayın veya derleme hata verirse eski site yayında kalır; o durumda 2. adımı uygulamayın.
   - Komut satırından kontrol: `curl -s https://rango.com.tr/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'` komutunun verdiği dosyada (`curl -s https://rango.com.tr/assets/<dosya> | grep -c satis-sozlesmesi`) sonuç en az 1 olmalı (eski sitede 0).
   - Gizli pencerede `https://rango.com.tr/yasal/satis-sozlesmesi` açılmalı. Başlık "Mesafeli Hizmet Satış Sözleşmesi ve Satış Onayı" olmalı, özette "Sürüm: 2026-11-20" yazmalı. Eski site bu adresi KVKK Aydınlatma Metni'ne yönlendirir. Sayfanın altında PAYTR cümlesi ve www.paytr.com bağlantısı olmalı.
   - Deneme müşteri hesabıyla, kendi deneme işletmenizde bir test ödemesi yapın (gerçek bir işletmeye bildirim gitmesin). "Satış onayı" kutusu görünmeli ve ödeme tamamlanmalı. `select appointment_id, sale_terms_version, consent_locale, payment_mode, accepted_at from sale_consents order by accepted_at desc limit 1;` sorgusu bu randevuyu göstermeli. Ardından randevuyu iptal edin.
   - Yeni site yayına çıktıktan sonra en az 15 dakika (ödeme bekleme süresi) geçmiş olmalı. `select count(*) from appointments where status = 'pending_payment' and created_at > now() - interval '15 minutes';` sonucu 0 olmalı.
   - Dağıtılmış bir mobil uygulama varsa o da satış onayını içeren koddan derlenmiş olmalı. Uygulama site kodunu kendi içinde taşır (`capacitor.config.ts` → `webDir: 'dist'`); eski koddan derlenmiş bir uygulama 2. adımdan sonra ödeme yapamaz. **Dikkat:** `claude/festive-noether-h1cugu` dalında hazırlanan Play Store paketi (`rango-1.0.0.aab`) PayTR ve satış onayından önceki koddan derlendi. Bu paketi test kullanıcılarına ya da mağazaya göndermeyin. Uygulamayı birleştirmeden sonraki `main`'den yeniden derleyin (yeni versionCode).

   Uyguladıktan sonra test ödemesini bir kez daha yapın; ödeme tamamlanmalı. Ardından dosyayı, Supabase'in kaydettiği sürüm numarasıyla `supabase/migrations/` klasörüne taşıyın.
- **Geri alma:** 2. adım uygulandıktan sonra site satış onayı olmayan eski bir sürüme döndürülecekse önce 2. adımı geri alın. Bu durumlar: Netlify'da (veya Hostinger'da) eski bir dağıtımı yeniden yayınlamak, GitHub'da geri almak ya da Bolt'tan eski kodu yayınlamak. Geri alma adımları dosyanın başındaki "Rollback" notundadır. Geri alınmazsa bütün ödemeler durur.
- **Not:** `20261114200000_rango_security_hardening.sql` yeniden çalıştırılırsa `pay_deposit` satış onayı kontrolü olmadan eski haline döner. O durumda 2. adım dosyasını hemen ardından yeniden çalıştırın.

**PayTR veya banka belge isterse (md. 6.4 ve 7.3: 2 iş günü içinde):** Supabase SQL Editor'de aşağıdaki sorguları randevu koduyla çalıştırın. Sonuçları, o sürümün metinleriyle birlikte gönderin. Metinler şu dosyalardadır: `src/pages/legal/legalContent.ts`, `src/lib/legal.ts` ve `src/pages/customer/booking/Payment.tsx` (ön bilgilendirme). Bu dosyaların, o sırada yayında olan sürümdeki hallerini kullanın. Yayınlanan sürümü tarihle değil, yayınlanan commit ya da etiketle (ör. `git tag satis-2026-11-20 <commit>`) belirleyin; aynı gün birden fazla değişiklik olabilir.

```sql
-- 1) Müşterinin verdiği bütün satış onayları (her onay ayrı satır)
SELECT a.booking_code, c.accepted_at, c.sale_terms_version, c.consent_locale, c.consent_wording, c.payment_mode,
       c.business_name, c.business_address, c.service_name, c.employee_name, c.starts_at, c.duration_minutes,
       c.total_price, c.deposit_amount, c.pay_at_business, c.cancellation_hours
FROM public.sale_consents c
JOIN public.appointments a ON a.id = c.appointment_id
WHERE a.booking_code = 'VY…'
ORDER BY c.accepted_at;

-- 2) Ödeme denemeleri ve sonuç (her PayTR siparişinden önceki son onay, o ödemenin onayıdır)
SELECT o.merchant_oid, o.created_at AS order_created_at, o.status, o.result, o.confirmed_via, o.amount_kurus, o.test_mode,
       p.provider_payment_id, p.status AS payment_status, p.paid_at,
       a.status AS appointment_status, a.cancelled_by, a.cancelled_at
FROM public.appointments a
LEFT JOIN private.paytr_orders o ON o.appointment_id = a.id
LEFT JOIN public.payments p ON p.id = o.payment_id
WHERE a.booking_code = 'VY…'
ORDER BY o.created_at;
```

**"PayTR canlı"ya geçmeden önce yapılması gerekenler (hukuki):**
1. **Cayma hakkı:** Sözleşme ve ön bilgilendirme, Mesafeli Sözleşmeler Yönetmeliği'ne göre 14 günlük cayma hakkını yazar; bu hak hizmete başlanana kadar geçerlidir. Gerçek tahsilatta iptal kuralı da buna uymalıdır. Müşteri cayma süresi içinde ve randevu başlamadan iptal ederse kapora iade edilmelidir. Bunun için `cancel_appointment`, iptal penceresindeki uyarı ve iptal bildirimi güncellenmelidir. Bildirimdeki "kapora iade edilmeyecektir" cümlesi test ödemelerinde de gidiyor; test ödemesinde "tahsilat yapılmadığından iade gerekmez" denmelidir. Ayrıca randevuya gelinmeyen (no-show) durumda cayma hakkının nasıl uygulanacağı netleşmelidir; şu anki metinde bu belirsiz kalıyor. Kuaför ve güzellik hizmetlerinde istisna (md. 15/1-g) uygulanabileceğini düşünüyorsanız bunu bir avukatla netleştirin; o durumda metinler de değişmelidir (yeni sürüm).
2. **Sözleşme örneğinin iletilmesi:** Ödemeden sonra müşteriye ön bilgilendirme ve sözleşmenin onayladığı sürümü e-postayla gönderilmelidir. E-posta bir "kalıcı veri saklayıcı"dır (TKHK md. 4, MSY md. 7). Şu an otomatik gönderim yok; isteyen müşteriye destekten gönderilir.
3. **Hizmet sağlayıcı kimliği:** Ön bilgilendirmede işletmenin unvanı, vergi numarası, açık adresi ve telefonu gösterilmelidir (MSY md. 5/1-b, c). Bu bilgiler işletmelerden toplanmalıdır; PayTR alt işyeri tanımı için de gerekir.
4. **Rango künyesi:** `src/lib/legal.ts` dosyasında `COMPANY.legalName`, vergi levhası ve PayTR sözleşmesindeki unvanla birebir aynı olmalıdır. `COMPANY.address` açık adres olmalıdır (mahalle, cadde/sokak, no, ilçe/il).
5. **Barındırma sağlayıcısı (KVKK):** Aydınlatma metni, siteyi gerçekten sunan barındırma sağlayıcısını göstermelidir (şu an metinde Hostinger yazıyor). Site Netlify'dan sunulursa Netlify, Inc. (ABD) eklenmeli; yurt dışı aktarım bölümü, standart sözleşme ve Kurum'a bildirim de buna göre güncellenmelidir.
6. **İşletmelerle sözleşme (PayTR Platform ek hükümleri):** Kapora işletme adına tahsil edildiği için işletmelerle bir sözleşme gerekir. Bu sözleşme şu hükümleri içermelidir: ticari temsil (yetki), PayTR kurallarına uyum, belge ve onay kayıtları. Yukarıdaki "pazaryeri modeli" notuyla birlikte değerlendirin.

---

## 7. Bilerek ertelenen konular

- **E-posta bağlantıları için PKCE akışı:** Supabase e-posta şablonlarının değiştirilmesini gerektirir.
- **Yorumlarda müşteri kimliğinin sütun düzeyinde gizlenmesi:** Yeni site yayına girdikten sonra ayrıca uygulanabilir.
- **"Gelmedi" (no-show) durumunda komisyon politikası:** Bu bir iş kararıdır.
- **`/yonetim/kurulum` sayfası:** Yönetici hesabı zaten var ve veritabanı güncellemesi uygulandı; bu sayfa artık kapalı.

---

## 8. Bolt'ta çalışmaya devam edecekseniz

Bu zip'i Bolt projenize **içe aktarın**. Aksi halde Bolt'taki eski kod, bu düzeltmelerin üzerine yazılır.

Bolt'taki her kayıt ("update from bolt") doğrudan `main` dalına gider. Site ise Bolt'un yayınlama düğmesiyle (Netlify) güncellenir. Satış onayı `main`'e alındıktan sonra Bolt'ta değişiklik yapmadan ya da yayınlamadan önce projede şunların olduğunu kontrol edin:
- `src/pages/customer/booking/Payment.tsx` içinde `record_sale_consent`
- `src/lib/legal.ts` içinde `PAYMENT_PROVIDER`

Bunlar yoksa önce GitHub'daki son `main`'i Bolt'a alın. Veritabanının 2. adımı uygulandıktan sonra ödeme ekranındaki satış onayı kaldırılırsa bütün ödemeler durur.
