# Rango – Yayınlama Rehberi

Bu paket; bağımlılık güvenlik açıkları kapatılmış, güvenlik ve hata düzeltmeleri yapılmış, KVKK uyum ekranları eklenmiş Rango uygulamasıdır.
Aşağıdaki adımları **sırayla** uygulayın.

---

## Frankfurt'a taşınma (26 Kasım 2026) – ✅ YAPILDI

**Geçiş yapıldı (26 Kasım 2026, 21:17–21:24 UTC, yaklaşık 7 dakika bakım):** Bakım modu açıldı. Eski projede istemci yazmaları durduruldu (aşağıya bakın). Veriler son kez kopyalanıp tablo tablo doğrulandı: 34 tablonun ve 2 dosyanın hepsi eşleşti. Site yeni adresle açıldı. Canlı CSP başlığı ve sitenin bütün Supabase istekleri `lvpmtvixzfhyndfnyyvn` adresine gidiyor.

**Eski projede (Tokyo) yapılanlar, hepsi geri alınabilir:**
- `ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.rango_tasindi_engel'`: anon/authenticated rollerinden gelen yazma istekleri `VEYRA_BOOKING_CLOSED` hatası alır. Okumalar ve STABLE RPC'ler (arama, uygun saatler) çalışır. Geri almak için: `ALTER ROLE authenticator RESET pgrst.db_pre_request; NOTIFY pgrst, 'reload config';`
- `auth.users` tablosunda `rango_tasindi_kayit_engel` tetikleyicisi: yeni kayıt açılmaz.
- 3 pg_cron işi durduruldu (`cron.alter_job(..., active := false)`).
- `paytr-token` 503 döndüren bir sürümle değiştirildi, böylece eski uygulamadan yeni ödeme başlamaz. Asıl kod depoda ve yeni projede yayında.
- Geçici taşıma fonksiyonları (`tasima-disa` eski projede, `tasima-ici` yeni projede) 410 döndüren sürümle değiştirildi. Panelden silebilirsiniz.

Aşağıdaki bölüm geçişten önceki planı ve kontrol listesini olduğu gibi tutar.

**Neden:** İlk Supabase projesi (`ocgqkdhrmjesrbksnrlh`, adı "dating") Tokyo'da (ap-northeast-1). Kullanıcılar Türkiye'de olduğu için veritabanı Frankfurt'taki yeni projeye (`lvpmtvixzfhyndfnyyvn`, adı "rangociddi", eu-central-1) taşınıyor. Supabase'de bir projenin bölgesi sonradan değiştirilemez, bu yüzden her şey yeni projeye kopyalanır.

| | Eski (Tokyo) | Yeni (Frankfurt) |
|---|---|---|
| Adres | `https://ocgqkdhrmjesrbksnrlh.supabase.co` | `https://lvpmtvixzfhyndfnyyvn.supabase.co` |
| Yayınlanabilir anahtar | `sb_publishable_4XWej0uOwOHjYXDwXYB7AQ_e2b8xLXr` | `sb_publishable_QYneF84_HqC8NdctqQ1mPA_496aY6Z5` |
| PayTR Bildirim URL | `…ocgqkdhrmjesrbksnrlh…/functions/v1/paytr-callback` | `https://lvpmtvixzfhyndfnyyvn.supabase.co/functions/v1/paytr-callback` |

**Hazır olanlar (Claude, Supabase bağlantısıyla):**
- **Şema:** 46 migration'ın hepsi aynı sürüm numaralarıyla uygulandı. Migration geçmişi eski projedekiyle birebir aynı. 14 Kasım'dan önceki 30 migration eski projede bozuk biçimde (kaçışlı satır sonları, yanlış bölünmüş ifadeler) kayıtlı olduğu için bunlar `supabase/migrations/` dosyalarından çalıştırıldı. İçerikleri kayıtlı olanlarla aynı.
- **Karşılaştırma:** tablolar, sütunlar, 174 kısıtlama, 93 indeks, 125 fonksiyon (gövde ve yetkileriyle birlikte), 72 RLS kuralı, tablo ve sütun yetkileri, tetikleyiciler, event trigger'lar, 3 pg_cron işi, realtime yayını ve depolama klasörü iki projede de birebir aynı. Farklı olan tek şey `claim_first_admin` yetkisiydi: migration'daki yetki kaldırma "yönetici varsa" koşuluna bağlı olduğu için yeni projede açık kalmıştı. Yetki elle kaldırıldı.
- **Edge Function'lar:** `support-ai`, `paytr-token`, `paytr-status`, `paytr-refund` (`verify_jwt` açık) ve `paytr-callback` (`verify_jwt` kapalı) depodaki koddan yayınlandı. Paket özetleri (`ezbr_sha256`) eski projede çalışan sürümlerle birebir aynı.
- **Deneme veri kopyası:** 34 tablo (auth.users ve auth.identities dahil, yani şifreler de taşınıyor) ve 2 depolama dosyası kopyalandı. Satır sayıları ve içerik özetleri eşleşti. Verilerde eski adresi gösteren 2 görsel bağlantısı yeni adrese çevrildi. Geçiş anında bu kopya silinip yeniden alınacak.
- **Kod:** `vite.config.ts` içindeki varsayılan adres ve anahtar yeni projeye çevrildi. Ayrıca bir panelde ya da `.env`'de eski Tokyo adresi kalmışsa derleme onu kullanmaz: yeni projeye geçer ve `[rango] UYARI: … kullanımdan kalkan eski Supabase projesini … gösteriyor` yazar (`RETIRED_PROJECT_REFS`). Bu değişiklik geçiş anına kadar `main`'e alınmaz.
- **Bakım ekranı:** `src/pages/Maintenance.tsx` (Art Deco tasarım). `src/lib/maintenance.ts` içindeki `MAINTENANCE_ENABLED = true` ile açılır.

**Sizin yeni projede yapmanız gerekenler (geçişten önce, Supabase paneli → `rangociddi` projesi):**
1. **Authentication → Sign In / Providers → Email → "Confirm email": KAPALI.** Yeni projede açık geliyor. Açık kalırsa geçişten sonra kimse kayıt olamaz (telefonla kayıt "oturum açılamadı" hatası verir).
2. **Authentication → URL Configuration → Site URL:** `https://rango.com.tr` (varsayılanı `http://localhost:3000`).
3. **Redirect URLs:** `https://rango.com.tr/giris`, `https://rango.com.tr/sifre-yenile`, `https://www.rango.com.tr/giris`, `https://www.rango.com.tr/sifre-yenile`. Eski projede başka adres varsa onları da ekleyin.
4. **Sign In / Providers:** yalnızca Email açık. "Allow new users to sign up" açık, Anonymous sign-ins kapalı (kod anonim giriş kullanmıyor), Phone ve OAuth kapalı. "Secure password change" açık.
5. **Şifre:** Minimum password length 8, "Leaked password protection" açık. Diğer şifre kuralları eski projedekiyle aynı olsun.
6. **Authentication → Emails → Security** altındaki "Password changed" / "Email changed" bildirimleri kapalı (telefon hesaplarının teknik adreslerine posta gitmesin). CAPTCHA kapalı.
7. **E-posta:** eski projede özel SMTP ya da Türkçe şablon tanımladıysanız aynısını girin. Rate limit, JWT süresi ve oturum ayarlarını da eski projedekiyle eşleyin. Bunlar MCP ile okunamıyor; eski projenin ilgili sayfalarına bakarak kopyalayın.
8. **Edge Functions → Secrets:** `PAYTR_MERCHANT_ID`, `PAYTR_MERCHANT_KEY`, `PAYTR_MERCHANT_SALT` girilmiş görünüyor (fonksiyonlar anahtar eksik hatası vermiyor). `OPENAI_API_KEY` ile, eski projede varsa `OPENAI_SUPPORT_MODEL`, `SITE_URL`, `SUPPORT_AI_USER_HOURLY` ve `SUPPORT_AI_GLOBAL_DAILY` değerlerini de eski projenin Secrets sayfasından kopyalayın.
9. **Hostinger:** hPanel → rango.com.tr → Node.js → ortam değişkenlerinde `VITE_SUPABASE_URL` / `SUPABASE_URL` ve anahtar değişkenleri varsa yeni adres ve anahtarla değiştirin ya da silin (silinirse `vite.config.ts` içindeki varsayılan kullanılır). Bolt'taki `.env` ve Bolt'un Supabase bağlantısı için de aynısı geçerli.

**Geçiş sırası (yaklaşık 10–15 dakika kesinti):**
1. Bakım modu `main`'e alınır (`MAINTENANCE_ENABLED = true`). Site yaklaşık 20 saniye içinde bakım ekranına geçer.
2. Eski projede yazma durdurulur. Mobil uygulama bakım modundan etkilenmez; o yüzden eski veritabanında anon/authenticated rollerinin yazması kapatılır. Bunun için ya Supabase → Settings → API Keys → "Disable JWT-based API keys" kullanılır (kurulu Android sürümü eski anahtarı kullanıyor), ya da Claude bir PostgREST `db_pre_request` engeli ekler. İki yol da geri alınabilir.
3. Eski projede başlamış ama bitmemiş PayTR ödemesi olmadığı kontrol edilir (`private.paytr_orders`, durum `started`).
4. Claude veriyi son kez kopyalar ve doğrular: tablo tablo satır sayısı ve içerik özeti, dosyalar ve adres düzeltmesi.
5. **Siz:** PayTR Mağaza Paneli → Destek & Kurulum → Ayarlar → **Bildirim URL** = `https://lvpmtvixzfhyndfnyyvn.supabase.co/functions/v1/paytr-callback`.
6. Yeni adres ve `MAINTENANCE_ENABLED = false` birlikte `main`'e alınır. Hostinger siteyi yeni veritabanından derler; statik SEO sayfaları da yeni veriden üretilir.
7. Kontrol: canlı CSP başlığında `lvpmtvixzfhyndfnyyvn` görünmeli. Gizli pencerede giriş, yeni kayıt, telefonla işletme girişi, şifremi unuttum ve randevu akışı denenmeli.
8. Eski projede pg_cron işleri durdurulur, "Allow new users to sign up" kapatılır. Geçici taşıma fonksiyonları (`tasima-disa` eski projede, `tasima-ici` yeni projede) etkisiz bir sürümle değiştirilir. Panelden silmeniz önerilir.
9. **Herkes bir kez yeniden giriş yapar.** Şifreler taşınır ama oturumlar taşınmaz: yeni projenin imza anahtarı farklıdır.

**Android:** Kurulu uygulamalar eski adresi içinde taşır ve bakım modundan etkilenmez. Yeni adresli sürüm, geçiş commit'inden sonra `main`'den derlenip Play'e yüklenmeli (bkz. `MOBIL-REHBERI.md`). Yeni sürüm yayılana kadar eski projeyi **duraklatmayın ve silmeyin**. Son 24 saatte uygulama trafiği 2 cihazdan geliyordu ve hepsi okuma isteğiydi.

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
  VITE_SUPABASE_URL=https://lvpmtvixzfhyndfnyyvn.supabase.co
  VITE_SUPABASE_ANON_KEY=sb_publishable_QYneF84_HqC8NdctqQ1mPA_496aY6Z5
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
- **Confirm email:** **kapalı** kalmalı. Telefonla kayıt olan işletme sahipleri, numaradan üretilen teknik bir giriş adresiyle (`tel-90…@rango.com.tr`) kaydedilir; bu adres e-posta alamaz. Ayar açılırsa telefonla kayıtlar tamamlanamaz (kayıttan sonra oturum açılmaz) ve onay e-postaları geri döner. Şu an kayıtta hiçbir onay e-postası gönderilmiyor; yasal metinler de buna göre yazıldı.
- **Phone provider:** **kapalı** kalmalı. SMS sağlayıcısı yok; telefonla giriş, e-posta/şifre altyapısı üzerinden teknik adresle yapılır.
- **Secure password change:** açık. Uygulama, şifre değiştirmeden önce mevcut şifreyle yeniden giriş yaptırdığı için telefon hesaplarına doğrulama e-postası gerekmez.
- **Leaked password protection:** açık
- **Güvenlik bildirim e-postaları** (**Authentication → Emails → Security**: "Password changed", "Email address changed" vb.): **kapalı** kalmalı. Açılırsa telefon hesaplarındaki her şifre değişikliği (yöneticinin verdiği geçici şifre dahil) teknik adrese e-posta gönderir; bu e-postalar geri döner ve gönderici itibarını düşürür.
- **Site URL:** `https://rango.com.tr`
- **Redirect URLs:** `https://rango.com.tr/giris` ve `https://rango.com.tr/sifre-yenile`
- Yönetici hesapları için iki adımlı doğrulamayı (**MFA / TOTP**) açmanız önerilir.
- `rango.com.tr` e-posta sunucusuna, alıcısı `tel-` ile başlayan iletileri **sessizce silen** (geri döndürmeyen, hiçbir kutuya teslim etmeyen) bir kural ekleyin; **tümünü yakala (catch-all)** ya da `tel-` ile başlayan kutu/takma ad tanımlamayın. Supabase'in şifre yenileme ve sihirli bağlantı uçlarını herkes çağırabildiği için teknik adreslere e-posta gönderilmesi sunucu tarafında engellenemez; bu kural olmadan bu iletiler geri döner (gönderici itibarı düşer) ya da bir kutuya düşer.

### İşletmeler için telefonla kayıt (26 Kasım 2026)

İşletme sahipleri e-posta yerine cep telefonu numarasıyla da kaydolabilir (müşteriler yalnızca e-postayla). Numara giriş bilgisidir; teknik adres hiçbir ekranda, dışa aktarımda veya üçüncü tarafa giden veride gösterilmez ve ona e-posta gönderilmez. Şifresini unutan telefon hesabı sahibi WhatsApp destek hattına kayıtlı numarasından yazar; yönetici kimliği doğruladıktan sonra geçici şifre verir.

- Veritabanı: `supabase/migrations/20261126100000_phone_signup_for_businesses.sql`. Yeni site yayınlanmadan **önce** SQL Editor'de (ya da Supabase bağlantısıyla) uygulayın; eski siteyi etkilemez. Telefon hesaplarında `profiles.email` boş, `profiles.phone` kayıtlı numaradır; bu numara başka bir numarayla değiştirilemez. Yönetici fonksiyonları: `admin_reset_phone_password` (geçici şifre, açık oturumları kapatır) ve `admin_phone_login_users`.
- Yasal metinler: Kullanım Koşulları ve KVKK Aydınlatma Metni bu değişiklikle güncellendi (`LEGAL_VERSIONS.terms` ve `.privacy` = `2026-11-26`).

**Yayından sonra test edin** (gizli pencerede, deneme hesaplarıyla; test kayıtlarını sonra silin):
- Kayıt → hesap türü "İşletme" → "Telefon numarası" ile kayıt. Kayıttan hemen sonra oturum açılmalı; Profil ve işletme panelinde teknik adres hiçbir yerde görünmemeli.
- Çıkış → Giriş ekranında "E-posta veya telefon" alanına numarayı yazıp giriş.
- Yönetim → Kullanıcılar → bu hesap → "Geçici şifre oluştur". Eski şifreyle giriş yapılamamalı, geçici şifreyle yapılabilmeli; açık oturumlar kapanmalı.
- Geçici şifreyle girdikten sonra şifre değiştirme: mevcut şifre + yeni şifre. Yeni şifreyle yeniden giriş yapılabilmeli ve hiçbir e-posta gönderilmemeli (Supabase → Authentication → Logs).
- Aynı numarayla ikinci bir işletme kaydı açılamamalı; müşteri kaydında e-posta alanına `tel-…@rango.com.tr` biçiminde bir adres yazılınca kayıt reddedilmeli.

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
   `https://lvpmtvixzfhyndfnyyvn.supabase.co/functions/v1/paytr-callback` (26 Kasım 2026'daki Frankfurt taşınmasından önce `ocgqkdhrmjesrbksnrlh` idi)
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
0. **Site metinleri:** Canlıya geçtiğiniz gün `src/lib/seo/config.ts` içindeki `PAYMENTS_IN_TEST_MODE` değerini `false` yapın (bkz. bölüm 7.6); aksi halde Sık Sorulan Sorular'da "test modu" notu kalır.
1. **Cayma hakkı:** Sözleşme ve ön bilgilendirme, Mesafeli Sözleşmeler Yönetmeliği'ne göre 14 günlük cayma hakkını yazar; bu hak hizmete başlanana kadar geçerlidir. Gerçek tahsilatta iptal kuralı da buna uymalıdır. Müşteri cayma süresi içinde ve randevu başlamadan iptal ederse kapora iade edilmelidir. Bunun için `cancel_appointment` ve iptal penceresindeki uyarı güncellenmelidir. Kuaför ve güzellik hizmetlerinde istisna (md. 15/1-g) uygulanabileceğini düşünüyorsanız bunu bir avukatla netleştirin; o durumda metinler de değişmelidir (yeni sürüm).
2. **Sözleşme örneğinin iletilmesi:** Ödemeden sonra müşteriye ön bilgilendirme ve sözleşmenin onayladığı sürümü e-postayla gönderilmelidir. E-posta bir "kalıcı veri saklayıcı"dır (TKHK md. 4, MSY md. 7). Şu an otomatik gönderim yok; isteyen müşteriye destekten gönderilir.
3. **Hizmet sağlayıcı kimliği:** Ön bilgilendirmede işletmenin unvanı, vergi numarası, açık adresi ve telefonu gösterilmelidir (MSY md. 5/1-b, c). Bu bilgiler işletmelerden toplanmalıdır; PayTR alt işyeri tanımı için de gerekir.
4. **Rango künyesi:** `src/lib/legal.ts` dosyasında `COMPANY.legalName`, vergi levhası ve PayTR sözleşmesindeki unvanla birebir aynı olmalıdır. `COMPANY.address` açık adres olmalıdır (mahalle, cadde/sokak, no, ilçe/il).
5. **Barındırma sağlayıcısı (KVKK):** Site Netlify'dan sunulduğu sürece aydınlatma metninde barındırma sağlayıcısı olarak Netlify, Inc. (ABD) yazmalıdır. Şu an metinde Hostinger yazıyor. Yurt dışı aktarım bölümü ile standart sözleşme ve Kurum'a bildirim de buna göre güncellenmelidir.
6. **İşletmelerle sözleşme (PayTR Platform ek hükümleri):** Kapora işletme adına tahsil edildiği için işletmelerle bir sözleşme gerekir. Bu sözleşme şu hükümleri içermelidir: ticari temsil (yetki), PayTR kurallarına uyum, belge ve onay kayıtları. Yukarıdaki "pazaryeri modeli" notuyla birlikte değerlendirin.

---

## 7. SEO (arama motoru görünürlüğü) – 23 Kasım 2026

Bu bölümdeki her şey kodda hazırdır ve site yayınlandığında (GitHub'da `main`'e birleştirilip yeniden derlendiğinde) kendiliğinden devreye girer.

### 7.1 Hangi sayfa dizine girer?

| Adres | Arama motorunda | Not |
| --- | --- | --- |
| `/` | Evet | Ana sayfa. Web'de yönlendirme yoktur; `/kesfet` aynı sayfadır ve canonical adresi `/` olur. Mobil uygulama açılış ekranıyla başlamaya devam eder. |
| `/izmir` | En az 1 işletme varsa | Şehir sayfası. |
| `/izmir/<kategori>` (ör. `/izmir/berber`) | En az 1 işletme varsa | Kategori sayfası. Ana sayfadaki ve `/kategoriler`deki kategori kutuları buraya gider. |
| `/izmir/<semt>` ve `/izmir/<semt>/<kategori>` | En az 2 işletme varsa | Tek işletmeli bir liste, o işletmenin kendi sayfasının kopyası olur; ikinci işletme gelince kendiliğinden açılır. |
| `/i/<işletme>` | Sahibi ve en az bir hizmeti varsa | Örnek (sahipsiz) ve deneme işletmeleri hariç. |
| `/kategoriler`, `/sss`, `/isletmeler-icin`, `/yasal/...` | Evet | |
| `/ara` (her türlü arama, filtre, sıralama), `/giris`, `/kayit`, giriş gerektiren sayfalar | Hayır | `noindex`. |

- "İşletme" burada **gerçek ve randevu alınabilir** işletme demektir: sahibi olan, en az bir aktif hizmeti olan ve deneme listesinde olmayan. Eşikler `src/lib/seo/listing.ts` → `INDEX_THRESHOLDS` içindedir.
- Eşiğin altındaki sayfalar çalışır ama `noindex` taşır ve sitemap'e girmez. Bir şehir/semt/kategori sayfasında hiç gerçek işletme yoksa, sayfa boş kalmasın diye örnek işletmeler "Örnek işletme" etiketiyle gösterilir.
- **Deneme işletmeleri:** `src/lib/seo/config.ts` → `TEST_BUSINESS_SLUGS`. Şu an yalnızca `black-blade` var (PayTR testinde kullanılan, tohum verisinden gelen işletme). Bu listedeki işletmeler uygulamada görünmeye devam eder ama Google'a gerçek işletme olarak sunulmaz. Yeni bir deneme işletmesi açarsanız adresindeki `/i/<...>` kısmını bu listeye ekleyin; işletmeyi kaldırırsanız listeden silin.

### 7.2 Metinler nerede, nasıl değişir?

- Şehir/semt/kategori sayfalarının tamamı (başlık, açıklama, liste, fiyat tablosu, sık sorulan sorular, bağlantılar) işletme verisinden üretilir: `src/lib/seo/pages/landing.ts`. Elle yazılmış, yere özgü bir iddia yoktur.
- Sık Sorulan Sorular: `src/lib/seo/pages/faq.ts`. "İşletmeler için": `src/lib/seo/pages/forBusiness.ts`. Ana sayfanın alt bölümleri: `src/lib/seo/pages/home.ts`. Ortak bloklar: `src/lib/seo/pages/common.ts`.
- **Metin kuralı:** Bu dosyalardaki her cümle uygulamanın gerçek davranışını ya da yasal metinleri anlatır. Sayı ("500+ salon"), üstünlük ("en iyi"), garanti, sabit komisyon oranı, ödeme takvimi, mağaza uygulaması gibi doğrulanamayan iddialar bilerek yazılmamıştır. İptal, cayma ve iade yanıtları İptal, Erteleme ve İade Koşulları'ndaki ifadeyle aynıdır; o metin, kapora/iptal kuralı ya da komisyon modeli değişirse bu dosyaları da güncelleyin.

### 7.3 Teknik yapı (özet)

- Her sayfanın başlığı, açıklaması, canonical adresi, paylaşım etiketleri ve yapısal verisi (schema.org: Organization, WebSite, LocalBusiness, BreadcrumbList, ItemList, FAQPage): `src/lib/seo/`.
- Derleme (`npm run build`) sonunda `seo/prerender.ts`, dizine girecek her sayfa için `dist/_seo/` altına statik bir HTML yazar, sayfanın verisini içine gömer (uygulama açılınca "yükleniyor" ekranı göstermeden devralır) ve `sitemap.xml` üretir. Kategoriler ve işletmeler derleme anında Supabase'den okunur.
- Aynı derleme, `dist/.htaccess` içine bu sayfaları asıl adreslerinde sunan kuralları yazar. `public/.htaccess` içindeki `# __SEO_STATIC_PAGES__` satırını **silmeyin**; kurallar onun yerine yazılır.
- Arama motoru botları siteyi her zaman Türkçe görür (`src/i18n/locale.ts`).
- Var olmayan dosya adresleri (ör. eski bir `/assets/...js`) artık uygulama sayfası yerine gerçek 404 döner. Statik sayfalardan biri sunucuda eksikse site bozulmaz; o adreste uygulamanın kendisi açılır.
- İşletme ve liste sayfaları "önce kapalı" çalışır: sayfa verisini yükleyip dizine girebileceğini doğrulayana kadar (ve veri yüklenemezse) `noindex` kalır.

### 7.4 Yayından sonra kontrol

```bash
curl -s https://rango.com.tr/robots.txt | head -3
```
```bash
curl -s https://rango.com.tr/sitemap.xml | grep -c "<loc>"
```
```bash
curl -s https://rango.com.tr/izmir | grep -o "<title>.*</title>"
```
```bash
curl -s https://rango.com.tr/sss | grep -o "<title>.*</title>"
```

- İlk komut `# Rango - https://rango.com.tr` ile başlamalı, ikincisi 10'dan büyük bir sayı vermeli.
- Üçüncü komut "İzmir … Randevusu | Rango" (başlık, o an listelenen kategorilerden oluşur), dördüncüsü "Sık Sorulan Sorular…" yazmalı. İkisi de "Rango | Online Kuaför, Berber ve Güzellik Randevusu" yazıyorsa statik sayfa kuralları çalışmıyordur (site yine çalışır); derleme günlüğünde `[rango] SEO: … statik sayfa` satırını ve sunucudaki `.htaccess` içinde `/_seo/` geçen `RewriteRule` satırlarını kontrol edin.
- Bir işletme sayfasını [Rich Results Test](https://search.google.com/test/rich-results) ile deneyin.

### 7.5 Sizin yapmanız gerekenler

1. **Google Search Console:** `rango.com.tr` için "Alan adı" mülkü ekleyin (Hostinger DNS'e TXT kaydı). Site Haritaları → `https://rango.com.tr/sitemap.xml` gönderin; ana sayfa, `/izmir` ve `/isletmeler-icin` için "Dizine eklenmesini iste" deyin.
2. **Bing Webmaster Tools** ve **Yandex Webmaster:** aynı sitemap'i ekleyin (Bing, Search Console'dan içe aktarabilir).
3. **İşletme kazanın.** Sıralamayı en çok belirleyen şey gerçek işletme sayısıdır: şu an randevu alınabilen 2 gerçek işletme var, bu yüzden dizine giren liste sayfası da azdır. Her yeni işletme kendi sayfasını, kategori ve (ikinci işletmeyle) semt sayfalarını kendiliğinden açar. `/isletmeler-icin` sayfası bu amaçla hazırlandı; işletme sahiplerine bu adresi gönderin.
4. **Google İşletme Profili:** İşletmelere, kendi Google profillerindeki "Randevu" bağlantısına Rango sayfalarını (`https://rango.com.tr/i/…`) eklemelerini önerin; Instagram profillerine de aynı bağlantıyı koysunlar. Yerel aramalarda en etkili adım budur.
5. **Yeni işletme veya kategori eklendiğinde** siteyi yeniden yayınlayın: statik sayfası ve sitemap kaydı derlemede oluşur. Yayınlamasanız da sayfa çalışır ve Google onu bulabilir, yalnızca daha yavaş.
6. **İçerik:** İşletmelerin açıklama, fotoğraf, hizmet ve çalışma saatlerini eksiksiz doldurmasını sağlayın; sayfanın Google'daki metni, fiyat tablosu ve "pazar günü açık mı" yanıtı bunlardan oluşur.
7. **Örnek (demo) işletmeler:** Gerçek işletme sayısı arttıkça yayından kaldırın.

### 7.6 Onayınızı bekleyen metin konuları

Aşağıdakiler bilinmediği için sayfalarda **yazılmadı**; karar verirseniz ilgili dosyaya eklenebilir:
- Komisyon oranı ve başka ücret olup olmadığı (`/isletmeler-icin` yalnızca "komisyon modeli" der, oran vermez).
- Kaporaların işletmeye ne zaman ve nasıl ödendiği.
- WhatsApp hattının gerçekten 7/24 yanıtlanıp yanıtlanmadığı (sayfalar "7/24" demez).
- Mobil uygulamanın mağaza bağlantıları (sayfalarda uygulama indirme çağrısı yoktur).
- **Site "PayTR canlı"ya geçtiğinde:** `src/lib/seo/config.ts` içindeki `PAYMENTS_IN_TEST_MODE` değerini `false` yapıp yeniden yayınlayın. Bu değer `true` iken kapora anlatılan yerlerde "test modunda gerçek tahsilat yapılmaz" notu ve `/sss` içinde test modu sorusu gösterilir.
- Şirket künyesi (`src/lib/legal.ts`): açık adres ve telefon eklenirse Google'daki kurum bilgisi (Organization) de zenginleşir.

### 7.7 Sonraki adım olarak önerilenler (bu çalışmada yapılmadı)

- İngilizce için ayrı adresler (`/en/...`) ve `hreflang`: şu an dil aynı adreste değiştiği için Google yalnızca Türkçe sürümü dizine ekler.
- Bir rehber/blog bölümü (ör. hizmet fiyat rehberleri); gerçek işletme verisi çoğaldıkça anlam kazanır.
- Başlık yazı tipi (Cormorant Garamond) için ölçüleri eşleştirilmiş bir yedek yazı tipi: uzun başlıklı sayfalarda (ör. `/isletmeler-icin`) yazı tipi yüklenirken oluşan küçük sayfa kaymasını giderir.
- İşletme sayfalarında "benzer işletmeler" bölümü (aynı kategorideki diğer işletmelere bağlantı); işletme sayısı arttığında iç bağlantıları güçlendirir.
- Ziyaret ölçümü (ör. çerezsiz bir analiz aracı). Çerez politikası şu an "analitik kullanmıyoruz" dediği için eklenirse metin de güncellenmelidir.
- Yeni işletmeler için yeniden yayın beklemeyen, Supabase'den beslenen dinamik bir sitemap.

---

## 8. Bilerek ertelenen konular

- **E-posta bağlantıları için PKCE akışı:** Supabase e-posta şablonlarının değiştirilmesini gerektirir.
- **Yorumlarda müşteri kimliğinin sütun düzeyinde gizlenmesi:** Yeni site yayına girdikten sonra ayrıca uygulanabilir.
- **"Gelmedi" (no-show) durumunda komisyon politikası:** Bu bir iş kararıdır.
- **`/yonetim/kurulum` sayfası:** Yönetici hesabı zaten var ve veritabanı güncellemesi uygulandı; bu sayfa artık kapalı.

---

## 9. Bolt'ta çalışmaya devam edecekseniz

Bu zip'i Bolt projenize **içe aktarın**. Aksi halde Bolt'taki eski kod, bu düzeltmelerin üzerine yazılır.

Bolt'taki her kayıt ("update from bolt") doğrudan `main` dalına gider. Site ise Bolt'un yayınlama düğmesiyle (Netlify) güncellenir. Satış onayı `main`'e alındıktan sonra Bolt'ta değişiklik yapmadan ya da yayınlamadan önce projede şunların olduğunu kontrol edin:
- `src/pages/customer/booking/Payment.tsx` içinde `record_sale_consent`
- `src/lib/legal.ts` içinde `PAYMENT_PROVIDER`

Bunlar yoksa önce GitHub'daki son `main`'i Bolt'a alın. Veritabanının 2. adımı uygulandıktan sonra ödeme ekranındaki satış onayı kaldırılırsa bütün ödemeler durur.
