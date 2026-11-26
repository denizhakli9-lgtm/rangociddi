# Rango – Yayınlama Rehberi

Bu paket; bağımlılık güvenlik açıkları kapatılmış, güvenlik ve hata düzeltmeleri yapılmış, KVKK uyum ekranları eklenmiş Rango uygulamasıdır.
Aşağıdaki adımları **sırayla** uygulayın.

---

## 0. Supabase API anahtarı geçişi (23 Kasım 2026) – site ve fonksiyonlar geçti; Android sürümü ve eski anahtarların kapatılması bekliyor

**Neden:** Supabase eski (legacy) JWT tabanlı `anon` ve `service_role` anahtarlarını kaldırıyor. [Resmî geçiş rehberine](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys) göre eski anahtarlar 2026 sonuna kadar çalışıyor. [GitHub duyurusunda](https://github.com/orgs/supabase/discussions/29260) tarih "Late 2026, TBC" olarak geçiyor, yani kesin gün açıklanmadı. Eski anahtarlar kapandığında bu anahtarı kullanan site, uygulama sürümü ve fonksiyonlar hiçbir isteği tamamlayamaz. Yerlerine yayınlanabilir (`sb_publishable_…`, tarayıcı ve uygulama için) ve gizli (`sb_secret_…`, yalnızca sunucu için) anahtarlar geçiyor.

**Yapılanlar:**
- **Site ve uygulama kodu:** `vite.config.ts` içindeki varsayılan anahtar, projenin `default` adlı yayınlanabilir anahtarı oldu. Pakete artık hiçbir yoldan eski JWT anahtarı giremez. Bir panelde ya da `.env`'de Rango projesinin eski anahtarı kalmışsa derleme yerine projenin `sb_publishable_` anahtarını kullanır ve uyarı yazar. Başka bir projenin eski anahtarı, gizli anahtarlar ve tanınmayan değerler derlemeyi durdurur. Böylece eski anahtarla yanlışlıkla bir site ya da mağaza sürümü çıkamaz. `.env` dosyasında `VITE_SUPABASE_PUBLISHABLE_KEY` (yeni ad) ya da `VITE_SUPABASE_ANON_KEY` (eski ad) kullanılabilir. İkisi birden varsa yenisi geçerlidir.
- **Edge Function'lar** (`support-ai`, `paytr-token`, `paytr-status`, `paytr-refund`, `paytr-callback`): anahtarlarını Supabase'in kendiliğinden verdiği `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS` değişkenlerinden (`default` anahtarı) okuyor. Eski `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` hiç kullanılmıyor, yedek olarak bile. Fonksiyonlar 22–23 Kasım 2026'da Supabase bağlantısı üzerinden yayınlandı: support-ai v8, paytr-token v6, paytr-status v4, paytr-refund v2, paytr-callback v4. Yayındaki kod depodakiyle birebir aynı. Eski anahtarlar açık olduğu sürece eski ve yeni sürümler birlikte sorunsuz çalışır.
- **`verify_jwt` değişmedi:** `paytr-callback`'te kapalı, diğer dördünde açık. Supabase'in bu kontrolü kullanıcı oturum JWT'lerini doğrular: eski HS256'yı ve projenin zaten kullandığı ES256 imzalama anahtarlarını. API anahtarı ise bu kontrolde JWT yerine geçmez. Dört fonksiyonu yalnızca giriş yapmış kullanıcılar çağırır ve fonksiyonlar kullanıcıyı ayrıca `auth.getUser()` ile doğrular. Ayrıntı `supabase/config.toml` içinde.
- Gizli (`sb_secret_…`) anahtar kodda, depoda ya da bu rehberde yazılı değildir; Supabase onu fonksiyonlara kendisi verir. Veritabanında eski anahtarı kullanan bir cron işi, `pg_net` çağrısı ya da webhook yok (kontrol edildi).

**Test edildi (23 Kasım 2026, yeni anahtarlarla, canlı Supabase projesine karşı):** Yeni derlemeyle şunlar denendi:
- kayıt, çıkış ve yeniden giriş, profil kaydı, keşfet/arama,
- destek konuşması (`support-ai` çağrıldı, konuşma temsilciye aktarıldı),
- KVKK hesap silme. Deneme hesabı bu yolla silindi, deneme destek konuşması da temizlendi.

Fonksiyonlar gizli anahtarla veritabanına ulaştı: `paytr-status`, `paytr-token`, `paytr-refund` ve `support-ai`. `paytr-callback` de anahtarını buldu. Supabase ağ geçidi günlüklerinde fonksiyonların yalnızca yeni anahtarları kullandığı görüldü.

**Canlı yayın (23 Kasım 2026, 17:03 UTC):** Geçiş `main`'e alındıktan yaklaşık 75 saniye sonra Hostinger yeni paketi yayınladı. Canlı pakette yalnızca `sb_publishable_` anahtarı var, eski JWT yok. Canlı sitede yeni bir deneme hesabıyla şu zincir denendi:
- kayıt,
- Black Blade Barbershop'ta randevu. Bu, tohum verisinden gelen ve 20 Kasım PayTR testinde kullanılan deneme işletmesi.
- satış onayı kaydı,
- `paytr-token`: PayTR ödeme jetonu alındı,
- `paytr-status`: PayTR durum sorgusu "ödeme yok" (004) döndü, doğru sonuç,
- saatin serbest bırakılması ve hesap silme. Test kayıtları temizlendi.

**Henüz yapılmadı:** test kartıyla ödeme → PayTR bildirimi (`paytr-callback`) → iptal → admin iadesi (`paytr-refund`). PayTR ödeme sayfası, testin yapıldığı yurt dışı bağlantıda "Sistem Bakımda" gösterdi. Bu adımları Türkiye'den bir tarayıcıyla deneyin (aşağıdaki 3. adım). İade onayı için admin hesabı gerekir.

**Günlüklere göre eski anahtarı hâlâ kullananlar (23 Kasım 2026):**
1. ~~canlı site `rango.com.tr`~~: 23 Kasım 17:03 UTC'de yeni anahtarla yeniden yayınlandı. Açık sekmelerde eski sayfa kalan ziyaretçilerin istekleri sayfa yenilenene kadar eski anahtarla gelebilir.
2. **cihazlara yüklenmiş Android uygulaması.** Türkiye'deki birkaç telefonda (ikisinde giriş yapılmış hesaplar var) ve Google Play'in yayın öncesi test cihazlarına benzeyen ABD cihazlarında kullanılıyor. Bu sürüm eski anahtarla derlenmiş; eski anahtarlar kapatılınca **tamamen çalışmaz hale gelir**.

### Sizin yapmanız gerekenler (sırayla)

**1. Site yayını: kendiliğinden.** `rango.com.tr` 22 Kasım 2026'dan beri Hostinger'dan sunuluyor (`platform: hostinger`). Hostinger, GitHub'da `main`'e gelen her değişiklikten sonra siteyi kendiliğinden derleyip yayınlıyor. Bu geçiş `main`'e alındığında site de yeni anahtarla yayınlandı. Bolt'tan ya da Netlify'dan ayrıca yayınlamanız gerekmez.

**2. Panellerde kalan eski anahtarı temizleyin (önerilir, zorunlu değil).** Derleme, bir panelde ya da `.env`'de Rango projesinin eski anahtarını görürse durmaz: yerine projenin `sb_publishable_` anahtarını kullanır ve derleme günlüğüne `[rango] UYARI: … eski (legacy) anon anahtarı var` yazar. Yine de karışıklık olmasın diye eski değeri değiştirin:
- **Hostinger:** hPanel → Web Siteleri → rango.com.tr → Node.js uygulaması → ortam değişkenleri. `VITE_SUPABASE_ANON_KEY` ya da `SUPABASE_ANON_KEY` değeri `eyJ…` ile başlıyorsa yeni anahtarla değiştirin. Hiç tanımlı değilse bir şey yapmanıza gerek yok.
- **Bolt** (`.env`) ve mobil uygulamayı derlediğiniz bilgisayardaki `.env`: aynı değişikliği yapın. Adres satırı aynı kalır; tırnak ve boşluk koymayın:
  ```
  VITE_SUPABASE_URL=https://ocgqkdhrmjesrbksnrlh.supabase.co
  VITE_SUPABASE_ANON_KEY=sb_publishable_4XWej0uOwOHjYXDwXYB7AQ_e2b8xLXr
  ```
- Anahtar Supabase panelinde **Settings → API Keys → "Publishable and secret API keys"** sekmesindeki **Publishable key** değeridir ve gizli değildir; zaten sitenin koduna gömülür. **Secret key'i (`sb_secret_…`) hiçbir yere kopyalamayın.**
- Bolt'tan Edge Function yayınlamadan önce Bolt'taki kodun son `main` olduğundan emin olun. Eski bir kopya yayınlanırsa fonksiyonlar eski anahtar değişkenlerine döner ve eski anahtarlar kapanınca çalışmaz.

**3. Canlı siteyi doğrulayın.**
- Paketteki anahtarı kontrol edin. Şu komut site dosyasının adını verir:
  ```bash
  curl -s https://rango.com.tr/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
  ```
  Çıkan dosya adını aşağıdaki `<dosya>` yerine yazın. İlk komut en az 1, ikincisi 0 vermeli:
  ```bash
  curl -s https://rango.com.tr/assets/<dosya> | grep -c sb_publishable_
  ```
  ```bash
  curl -s https://rango.com.tr/assets/<dosya> | grep -c eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
  ```
- Gizli pencerede şu akışları deneyin (site şu an "PayTR test" modunda olduğu için gerçek tahsilat olmaz):
  1. Deneme müşteri hesabıyla giriş yapın.
  2. **Kendi deneme işletmenizde** randevu alın (gerçek bir işletmeye bildirim gitmesin).
  3. Satış onayı kutusunu işaretleyip PayTR test kartıyla ödeyin ("Ödeme Yap" → 3D sayfasında "Gönder"). Randevu birkaç saniyede onaylanmalı; bu adım PayTR bildirimini (`paytr-callback`) ve durum sorgusunu (`paytr-status`) dener.
  4. Randevuyu iptal edin. Otomatik iade talebi açılmalı.
  5. Admin hesabıyla **Yönetim → İadeler**'de iadeyi onaylayın. PayTR iadesi gönderilmeli (`paytr-refund`).
  6. **Destek**'te bir mesaj gönderin (`support-ai`).
  7. Bir kez çıkış yapıp tekrar giriş yapın.
- İsterseniz bu adımlardan sonra Claude'a (Supabase bağlantısıyla) günlükleri kontrol ettirin. Hangi isteğin hangi anahtarla geldiği Supabase ağ geçidi günlüklerinde görünür.

**4. Android uygulamasının yeni sürümünü yayınlayın** (ayrıntı: `MOBIL-REHBERI.md`, "Supabase anahtarı ve mağaza sürümleri"). Son `main` ile `npm run android` → imzalı yeni `.aab` (sürüm kodunu artırın) → Google Play'de mevcut sürümün bulunduğu kanal(lar)a yükleyin. Eski sürümlerin trafiği bitene kadar 6. adımı yapmayın. Play güncellemeleri birkaç gün sürebilir; Supabase'in son tarihi 2026 sonu olduğu için bunu bekletmeyin.

**5. Eski anahtarı kullanan kalmadığını doğrulayın.** Claude'dan Supabase bağlantısıyla son 24 saatin ağ geçidi günlüklerini anahtar türüne göre saydırmasını isteyin. Eski anahtar istekleri günlükte `request.sb.jwt.apikey.payload.role = anon / service_role` olarak, yeni anahtarlar `request.sb.apikey.apikey.prefix = sb_publishable_… / sb_secret_…` olarak görünür. Kullanılan sorgu:
```sql
select multiIf(log_attributes['request.sb.jwt.apikey.payload.role'] in ('anon', 'service_role'), 'ESKİ', startsWith(log_attributes['request.sb.apikey.apikey.prefix'], 'sb_'), 'yeni', 'anahtarsız') as anahtar,
       log_attributes['request.headers.referer'] as kaynak, count(*) as istek, max(timestamp) as son
from logs where source = 'edge_logs' group by anahtar, kaynak order by istek desc
```
"ESKİ" satırlarında `https://rango.com.tr/`, `https://www.rango.com.tr/` (site) ve `https://localhost/` (Android uygulaması) kalmamalı. `127.0.0.1` / `localhost:4173` gibi kaynaklar geliştirme ve test çalıştırmalarıdır. Kaynağı boş "ESKİ" satırlar `curl` / `node` gibi betiklerden gelir; 23 Kasım'da birkaç tane görüldü. Bunları tanımıyorsanız, eski anahtarı içeren bir betik ya da otomasyon olup olmadığını kontrol edin.

**6. Eski anahtarları kapatın.** Supabase → **Settings → API Keys → "Legacy API Keys"** sekmesindeki **Disable JWT-based API keys** düğmesine basın. Sonra 3. adımdaki akışları kısaca tekrar deneyin. Bir şey bozulursa aynı sayfadan eski anahtarları yeniden açabilirsiniz; işlem geri alınabilir.

> İsteğe bağlı, zorunlu değil: Kullanıcı oturumları zaten ES256 imzalama anahtarıyla imzalanıyor. Eski anahtarlar kapatıldıktan sonra **Settings → JWT Keys** sayfasında eski (legacy) JWT secret'ı da iptal edebilirsiniz. Supabase bunu yalnızca eski anahtarlar kapalıyken izin verir.

---

## 1. Hostinger'a yükleme (site kodu)

> **Not (23 Kasım 2026):** `rango.com.tr` artık **Hostinger**'dan sunuluyor (sunucu yanıtında `platform: hostinger`). GitHub'da `main`'e gelen her değişiklik birkaç saniye içinde kendiliğinden derlenip yayınlanıyor. 22 Kasım'da birleştirilen bir değişiklik yaklaşık 20 saniye sonra canlıdaydı. 20 Kasım'a kadar site Netlify'dan, Bolt'un yayınlama düğmesiyle sunuluyordu.

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
   > - Supabase ayarları şu sırayla okunur: `.env` dosyası ya da `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` (eski adıyla `VITE_SUPABASE_ANON_KEY`) ortam değişkenleri → Hostinger'ın "Veritabanı bağla → Supabase" sihirbazının yazdığı `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` (ya da `SUPABASE_ANON_KEY`) → `vite.config.ts` içindeki varsayılan (herkese açık) değerler. Adres ve anahtar her zaman birlikte verilmelidir.
   > - Anahtar projenin `sb_publishable_` ile başlayan yayınlanabilir anahtarı olmalıdır. Rango projesinin eski (legacy) anon anahtarı verilmişse derleme yerine `vite.config.ts` içindeki yayınlanabilir anahtarı kullanır ve uyarı yazar. Başka bir projenin eski anahtarı, gizli (`sb_secret_` / `service_role`) anahtar ya da tanınmayan bir değer verilirse derleme durur ve hangi değişkenin düzeltileceğini yazar. Hostinger sihirbazı eski anon anahtarını yazmışsa ortam değişkenini `sb_publishable_` anahtarıyla değiştirin (bkz. 0. bölüm).
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

Dosya: `supabase/functions/support-ai/index.ts`. Supabase bağlantısı üzerinden yayınlandı (giriş kontrolü `verify_jwt` açık). Son sürüm **v8**: 22 Kasım 2026'da yeni API anahtarlarına geçirildi (bkz. 0. bölüm).
Yayındaki kodun bu dosyayla birebir aynı olduğu doğrulandı ve fonksiyonun çalıştığı test edildi. Tekrar yayınlamanıza gerek yok.
İleride kodu değiştirirseniz `supabase functions deploy support-ai` ile (veya Bolt üzerinden, Bolt'taki kod son `main` ise) yeniden yayınlayın.

> **Açık sorun (26 Kasım 2026): destek asistanı yanıt veremiyor.** İki neden vardı:
> 1. `OPENAI_SUPPORT_MODEL` gizli değişkeninde model adı yerine `key_` ile başlayan bir değer duruyordu, OpenAI de `404 model_not_found` döndürüyordu. Kod artık model adına benzemeyen değeri yok sayıp varsayılan `gpt-6-luna`'yı kullanıyor (support-ai v10). `gpt-4o-mini` 14 Ocak 2027'de kapanacağı için varsayılan değiştirildi. Supabase → Edge Functions → Secrets'ta `OPENAI_SUPPORT_MODEL`'i silin ya da bir model adı yazın. Oradaki `key_…` değerinin ne olduğunu da kontrol edin: yanlış yere yapıştırılmış bir anahtar ya da kimlikse ilgili yerde yenileyin.
> 2. **OpenAI hesabında kredi bitmiş:** OpenAI şimdi `429 insufficient_quota` (`credit_balance_exhausted`) döndürüyor. OpenAI hesabınıza (platform.openai.com → Billing) kredi ekleyene kadar her konuşma temsilciye aktarılır. Kredi eklendikten sonra `gpt-6-luna` ile yapılandırılmış yanıtın (strict `json_schema`) çalıştığı bir destek mesajıyla denenmeli. Hata alırsanız `OPENAI_SUPPORT_MODEL` değerini `gpt-5.4-mini` yapın.

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
- Edge Function'lar: `paytr-token` (ödeme sayfası), `paytr-callback` (PayTR Bildirim URL), `paytr-status` (PayTR durum sorgusu ile yedek kontrol), `paytr-refund` (admin iadesi PayTR'ye gider). 22–23 Kasım 2026'da yeni Supabase API anahtarlarına geçirildiler (bkz. 0. bölüm).
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
- Onay; sözleşme sürümü, dili ve onay anındaki ön bilgilendirme bilgileriyle (işletme adı ve adresi, hizmet, uzman, tarih, tutarlar, iptal süresi) `sale_consents` tablosuna kaydedilir. Kayıtlar 10 yıl saklanır; sitede ve servis anahtarıyla elle değiştirilemez.
- Aşağıdaki 2. adım uygulandıktan sonra `pay_deposit` ve PayTR siparişleri, onay kaydı olmayan ödemeyi başlatmaz.
- Sözleşme metni: `/yasal/satis-sozlesmesi`. İptal ve İade Koşulları ile birlikte kabul edilir.
- Site altbilgisinde ve ödeme ekranında PayTR cümlesi ve www.paytr.com bağlantısı gösterilir (md. 10.3).
- Müşterinin "Verilerimi indir" dosyasında kendi satış onayları da yer alır.

**Metin değişirse:** `src/lib/legal.ts` → `LEGAL_VERSIONS.sale` değerini yayın tarihiyle `YYYY-AA-GG` biçiminde güncelleyin (ör. `2026-12-01`; aynı gün ikinci bir değişiklik için `2026-12-01.2`). İleri bir tarih yazmayın. Başka biçimde yazılan sürüm veritabanınca reddedilir: satış onayı kaydedilemez ve hiçbir ödeme tamamlanamaz.

**Veritabanı güncellemesi iki adımdır ve sıra önemlidir.** Dosyaları tek tek SQL Editor'de (ya da Supabase bağlantısıyla) uygulayın. `supabase db push` kullanmayın: bekleyen bütün dosyaları birlikte uygular.
1. `supabase/migrations/…_record_sale_consent.sql` (onay tablosu ve kayıt fonksiyonu). Yeni site yayınlanmadan **önce** uygulanır ve eski siteyi etkilemez. Kontrol sorgusu `true` döndürmeli:
   `select to_regclass('public.sale_consents') is not null and to_regprocedure('public.record_sale_consent(uuid,text,text)') is not null;`
2. `supabase/bekleyen/require_sale_consent_for_payment.sql` (onaysız ödemeyi reddetme). Aşağıdakilerin **hepsi** doğrulandıktan sonra uygulanır. Erken uygulanırsa eski kodla açılmış ödeme ekranlarında ödemeler "Bir sorun oluştu" hatasıyla durur.
   - Site yeni kodla yayınlandı: Bolt'taki proje GitHub'daki son `main`'i içeriyor ve Bolt'tan yayınlandı (Netlify). Site Hostinger'dan sunuluyorsa hPanel → Node.js'teki son derleme başarılı olmalı. Yayın veya derleme hata verirse eski site yayında kalır; o durumda 2. adımı uygulamayın.
   - Komut satırından kontrol: `curl -s https://rango.com.tr/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'` komutunun verdiği dosyada (`curl -s https://rango.com.tr/assets/<dosya> | grep -c satis-sozlesmesi`) sonuç en az 1 olmalı (eski sitede 0).
   - Gizli pencerede `https://rango.com.tr/yasal/satis-sozlesmesi` açılmalı. Başlık "Mesafeli Hizmet Satış Sözleşmesi ve Satış Onayı" olmalı, özette "Sürüm: 2026-11-20" yazmalı. Eski site bu adresi KVKK Aydınlatma Metni'ne yönlendirir. Sayfanın altında PAYTR cümlesi ve www.paytr.com bağlantısı olmalı.
   - Deneme müşteri hesabıyla, kendi deneme işletmenizde bir test ödemesi yapın (gerçek bir işletmeye bildirim gitmesin). "Satış onayı" kutusu görünmeli ve ödeme tamamlanmalı. `select appointment_id, sale_terms_version, consent_locale, payment_mode, accepted_at from sale_consents order by accepted_at desc limit 1;` sorgusu bu randevuyu göstermeli. Ardından randevuyu iptal edin.
   - Yeni site yayına çıktıktan sonra en az 15 dakika (ödeme bekleme süresi) geçmiş olmalı. `select count(*) from appointments where status = 'pending_payment' and created_at > now() - interval '15 minutes';` sonucu 0 olmalı.
   - Dağıtılmış bir mobil uygulama varsa o da satış onayını içeren koddan derlenmiş olmalı. Uygulama site kodunu kendi içinde taşır (`capacitor.config.ts` → `webDir: 'dist'`); eski koddan derlenmiş bir uygulama 2. adımdan sonra ödeme yapamaz.

   Uyguladıktan sonra test ödemesini bir kez daha yapın; ödeme tamamlanmalı. Ardından dosyayı, Supabase'in kaydettiği sürüm numarasıyla `supabase/migrations/` klasörüne taşıyın.
- **Geri alma:** 2. adım uygulandıktan sonra site satış onayı olmayan eski bir sürüme döndürülecekse önce 2. adımı geri alın. Bu durumlar: Netlify'da (veya Hostinger'da) eski bir dağıtımı yeniden yayınlamak, GitHub'da geri almak ya da Bolt'tan eski kodu yayınlamak. Geri alma adımları dosyanın başındaki "Rollback" notundadır. Geri alınmazsa bütün ödemeler durur.
- **Not:** `20261114200000_rango_security_hardening.sql` yeniden çalıştırılırsa `pay_deposit` satış onayı kontrolü olmadan eski haline döner. O durumda 2. adım dosyasını hemen ardından yeniden çalıştırın.

**PayTR veya banka belge isterse (md. 6.4 ve 7.3: 2 iş günü içinde):** Supabase SQL Editor'de aşağıdaki sorguyu randevu koduyla çalıştırın. Sonucu, o sürümdeki sözleşme metniyle birlikte gönderin. O sürümün metni, GitHub'da `src/pages/legal/legalContent.ts` ve `src/lib/legal.ts` dosyalarının o tarihteki halidir.

```sql
SELECT a.booking_code, c.accepted_at, c.sale_terms_version, c.consent_locale, c.payment_mode, c.payment_provider,
       c.business_name, c.business_address, c.service_name, c.employee_name, c.starts_at, c.duration_minutes,
       c.total_price, c.deposit_amount, c.pay_at_business, c.cancellation_hours,
       p.provider_payment_id, p.status AS payment_status, p.paid_at, p.card_brand, p.card_last4,
       a.status AS appointment_status, a.cancelled_by, a.cancelled_at
FROM public.sale_consents c
JOIN public.appointments a ON a.id = c.appointment_id
LEFT JOIN public.payments p ON p.appointment_id = c.appointment_id
WHERE a.booking_code = 'VY…';
```

**"PayTR canlı"ya geçmeden önce yapılması gerekenler (hukuki):**
1. **Cayma hakkı:** Sözleşme ve ön bilgilendirme, Mesafeli Sözleşmeler Yönetmeliği'ne göre 14 günlük cayma hakkını yazar; bu hak hizmete başlanana kadar geçerlidir. Gerçek tahsilatta iptal kuralı da buna uymalıdır. Müşteri cayma süresi içinde ve randevu başlamadan iptal ederse kapora iade edilmelidir. Bunun için `cancel_appointment` ve iptal penceresindeki uyarı güncellenmelidir. Kuaför ve güzellik hizmetlerinde istisna (md. 15/1-g) uygulanabileceğini düşünüyorsanız bunu bir avukatla netleştirin; o durumda metinler de değişmelidir (yeni sürüm).
2. **Sözleşme örneğinin iletilmesi:** Ödemeden sonra müşteriye ön bilgilendirme ve sözleşmenin onayladığı sürümü e-postayla gönderilmelidir. E-posta bir "kalıcı veri saklayıcı"dır (TKHK md. 4, MSY md. 7). Şu an otomatik gönderim yok; isteyen müşteriye destekten gönderilir.
3. **Hizmet sağlayıcı kimliği:** Ön bilgilendirmede işletmenin unvanı, vergi numarası, açık adresi ve telefonu gösterilmelidir (MSY md. 5/1-b, c). Bu bilgiler işletmelerden toplanmalıdır; PayTR alt işyeri tanımı için de gerekir.
4. **Rango künyesi:** `src/lib/legal.ts` dosyasında `COMPANY.legalName`, vergi levhası ve PayTR sözleşmesindeki unvanla birebir aynı olmalıdır. `COMPANY.address` açık adres olmalıdır (mahalle, cadde/sokak, no, ilçe/il).
5. **Barındırma sağlayıcısı (KVKK):** Site Netlify'dan sunulduğu sürece aydınlatma metninde barındırma sağlayıcısı olarak Netlify, Inc. (ABD) yazmalıdır. Şu an metinde Hostinger yazıyor. Yurt dışı aktarım bölümü ile standart sözleşme ve Kurum'a bildirim de buna göre güncellenmelidir.
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
