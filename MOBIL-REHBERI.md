# Rango – Mobil Uygulama Rehberi (Android & iOS)

Rango'nun mobil uygulaması **Capacitor** ile yapılır. Sitenin React kodu (`src/`) olduğu gibi telefona gömülür.
Site ile uygulama **aynı kodu** kullanır: bir şeyi düzelttiğinde ikisinde birden düzelir.

Uygulama kimliği: **`tr.com.rango.app`** (`capacitor.config.ts`). Mağazaya yüklendikten sonra değiştirilemez.

**iPhone / App Store için adım adım rehber: [`APP-STORE-REHBERI.md`](APP-STORE-REHBERI.md).** Bu dosyadaki iOS notları özet niteliğindedir.

---

## 0. Bir kerelik hazırlık

| Ne | Neden | Nereden |
|---|---|---|
| Node.js 22 | Kodu derlemek için | nodejs.org |
| Android Studio | Android uygulamasını derlemek için | developer.android.com/studio |
| Mac + Xcode (yalnızca iOS) | iPhone uygulaması için zorunlu | Mac App Store |
| Google Play Console hesabı | Play Store'a yüklemek için (tek seferlik 25$) | play.google.com/console |
| Apple Developer hesabı | App Store'a yüklemek için (yıllık 99$) | developer.apple.com |

> Mac'in yoksa iOS derlemesini bulut servisleriyle (Ionic Appflow, Codemagic vb.) yapabilirsin. Android'i Windows'ta yaparsın.

---

## 1. Kurulum (proje klasöründe, bir kere)

```bash
npm install
```

Bu komut Capacitor paketlerini yükler ve `package-lock.json` dosyasını günceller.
**Güncellenen `package-lock.json` dosyasını GitHub'a da gönder.** Yoksa Hostinger'daki site derlemesi hata verebilir.

`.env` dosyası sitedekiyle aynı olmalı: `VITE_SUPABASE_URL` ve projenin `sb_publishable_` ile başlayan anahtarı. Anahtar `VITE_SUPABASE_PUBLISHABLE_KEY` ya da eski adıyla `VITE_SUPABASE_ANON_KEY` değişkenine yazılabilir. `.env` yoksa `vite.config.ts` içindeki varsayılan değerler kullanılır (o da `sb_publishable_` anahtarı).
Uygulamaya hiçbir yoldan eski (legacy) JWT anahtarı giremez. `.env`'de Rango projesinin eski anahtarı kalmışsa derleme yerine yayınlanabilir anahtarı kullanır ve `[rango] UYARI` yazar; yine de `.env`'yi güncelle. Başka bir projenin eski anahtarı ya da gizli bir anahtar varsa `npm run android` / `npm run ios` hata verip durur.
İstersen `VITE_SITE_URL=https://rango.com.tr` de ekleyebilirsin. Eklemezsen bu adres zaten varsayılan.

Sonra telefon projelerini oluştur:

```bash
npx cap add android
npx cap add ios        # yalnızca Mac'te
```

`android/` git'te tutulmaz; her derlemede `scripts/android-prepare.mjs` ile yeniden oluşturulur (bkz. 3b). `ios/` ise git'te **hazır** durur (Xcode imza ayarını orada saklar). `npx cap add ios` çalıştırmana gerek yok: `npm run ios` her seferinde `scripts/ios-prepare.mjs` ile projeyi günceller.

---

## 2. Konum izni (bir kere, zorunlu)

Uygulama "Konumumu kullan" düğmesi için telefonun konumunu kullanır.

**Android:** `android/app/src/main/AndroidManifest.xml` dosyasında, `</manifest>` satırının hemen üstüne ekle:

```xml
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

**iOS:** elle bir şey ekleme. Konum (`NSLocationWhenInUseUsageDescription` ve eklentinin istediği `NSLocationAlwaysAndWhenInUseUsageDescription`), kamera ve fotoğraf izin metinlerini `scripts/ios-prepare.mjs` her derlemede `Info.plist`'e yazar. Metni değiştirmek için o dosyadaki `PLIST` bölümünü düzenle.

---

## 3. Uygulamayı çalıştırma / derleme

```bash
npm run android     # derler, Android Studio'yu açar
npm run ios         # derler, Xcode'u açar (Mac)
```

- Android Studio'da yeşil ▶ düğmesi telefonda/emülatörde çalıştırır.
- Play Store dosyası için: **Build → Generate Signed App Bundle / APK → Android App Bundle (.aab)**.
  Oluşturduğun **imza anahtarını (keystore) ve şifresini kaybetme.** Kaybedersen uygulamayı bir daha güncelleyemezsin.
- iOS: Xcode'da **Product → Archive → Distribute App** (ayrıntı: `APP-STORE-REHBERI.md` 7. adım; her yüklemede `IOS_BUILD_NUMBER`'ı artır).

Kodda değişiklik yaptıktan sonra yeniden `npm run android` veya `npm run ios` çalıştırman yeterli.

---

## 3a. Supabase anahtarı ve mağaza sürümleri (önemli)

Supabase anahtarı derleme anında uygulamanın içine gömülür. Telefondaki bir sürümün anahtarı sonradan değiştirilemez; ancak yeni sürüm yayınlanarak değişir.

- **Bu geçişten önceki kodla derlenen her sürüm** (GitHub'daki Kasım 2026 öncesi `main`, ya da `.env`'inde `eyJ…` ile başlayan anahtar olan bir bilgisayar) Supabase'in eski (legacy) anon anahtarını içerir. Supabase eski anahtarları kapattığında (en geç 2026 sonu ya da `YAYINLAMA-REHBERI.md` 0. bölümdeki 6. adımda sen kapattığında) bu sürümler **hiçbir şey yükleyemez**: giriş, randevu ve ödeme çalışmaz.
- **23 Kasım 2026 durumu:** Supabase günlüklerinde eski anahtarla çalışan bir Android sürümü görülüyor. Türkiye'de birkaç telefonda kullanılıyor ve bazılarında hesaplarla giriş yapılmış. ABD'deki cihazlar Google Play'in yayın öncesi testlerine benziyor, yani büyük olasılıkla Play Console'a yüklenmiş eski bir sürüm var.
- **Yapılacak:** GitHub'daki son `main` ile yeni bir sürüm derle. `android/app/build.gradle` içinde `versionCode`'u artır. Ardından Play Console'da mevcut sürümün bulunduğu kanal(lar)a yükle. iOS'ta bir sürüm yayınladıysan onu da yenile.
- Yeni sürümün yeni anahtarı içerdiğini derlemeden sonra kontrol et. İlk komut en az 1, ikincisi 0 vermeli:
  ```bash
  grep -c sb_publishable_ dist/assets/index-*.js
  ```
  ```bash
  grep -c eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 dist/assets/index-*.js
  ```
- Eski anahtarları ancak eski sürümlerin trafiği bittikten sonra kapat. Uygulama istekleri Supabase günlüklerinde `https://localhost/` kaynağıyla görünür; `YAYINLAMA-REHBERI.md` 0. bölüm, 5. adım.

---

## 3b. Otomatik derleme (GitHub Actions) – önerilen yol

`.github/workflows/android.yml`: GitHub'a (`main`) her kod gönderildiğinde uygulama GitHub'ın kendi bilgisayarında derlenir. Android Studio açmana gerek kalmaz.

- `android/` klasörü artık git'te tutulmaz. Her derlemede `scripts/android-prepare.mjs` onu sıfırdan oluşturur. Bu betik simge ve açılış ekranını `assets/` klasöründen üretir, konum izinlerini ekler ve sürüm numarasını yazar. Bilgisayarında da aynısı `npm run android` ile olur.
- **Sürüm kodu** `100000 + çalıştırma numarası` olur (ör. 100007). Böylece daha önce elle yüklediğin sürümlerin (1, 2, 3…) hep üstünde kalır. Bundan sonra elle derleyeceksen `build.gradle`'daki kodu Play'deki en büyük koddan büyük yap.
- Derlenen dosyalar: GitHub → **Actions** → "Android uygulaması" → son çalıştırma → **Artifacts** (30 gün durur).

**Bir kerelik: imza anahtarını GitHub'a tanıt.** Play'e yüklenen her sürüm, ilk sürümü imzaladığın anahtarla (keystore, `.jks`) imzalanmalı. Anahtar dosyasını metne çevir:

- Windows (PowerShell, `.jks` dosyasının olduğu klasörde):
  ```powershell
  [Convert]::ToBase64String([IO.File]::ReadAllBytes("rango.jks")) | Set-Content rango-jks.txt
  ```
- Mac / Linux:
  ```bash
  base64 -i rango.jks -o rango-jks.txt
  ```

GitHub'da depo → **Settings → Secrets and variables → Actions → New repository secret** ile şu dördünü ekle:

| Ad | Değer |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `rango-jks.txt` dosyasının içeriğinin tamamı |
| `ANDROID_KEYSTORE_PASSWORD` | keystore şifresi |
| `ANDROID_KEY_ALIAS` | anahtar adı (alias; Android Studio'da imzalarken seçtiğin, ör. `key0`) |
| `ANDROID_KEY_PASSWORD` | anahtar şifresi (çoğu zaman keystore şifresiyle aynı) |

Sonra `rango-jks.txt` dosyasını sil. Şifreleri sohbet, e-posta ya da kod içine yazma; yalnızca bu ekrana gir. Sırlar tanımlı değilse iş akışı yine çalışır, ama yalnızca telefona kurulup denenebilen **imzasız deneme APK'sı** üretir.

GitHub → **Actions** → "Android uygulaması" → **Run workflow** ile elle de başlatabilirsin.

**İsteğe bağlı: Play'e kendiliğinden yükleme.** Play Console → **Kurulum → API erişimi** bölümünden bir hizmet hesabı (service account) oluştur ve ona "Sürümleri yayınla" izni ver. JSON anahtarının içeriğini `PLAY_SERVICE_ACCOUNT_JSON` adlı sır olarak ekle. Bundan sonra her `main` derlemesi Play'in **dahili test** kanalına kendiliğinden yüklenir. Başka bir kanal için depo değişkeni `PLAY_TRACK` tanımla (`alpha`, `beta`, `production`). Uygulama Play'de henüz hiç yayınlanmadıysa ilk sürümü elle yükle.

---

## 4. Simge ve açılış ekranı

Android'de bu adım `scripts/android-prepare.mjs` ile kendiliğinden yapılır. `assets/` klasöründe sitedeki logodan üretilmiş 1024×1024 `icon.png`, 2732×2732 `splash.png` (açık zemin `#f8f7f3`) ve `splash-dark.png` (koyu tema) var. Değiştirmek için bu dosyaları aynı boyutta yenileriyle değiştir.
iOS'ta da aynı dosyalardan `scripts/ios-prepare.mjs` üretir (`npm run ios`).

---

## 5. Mobil için kodda neler değişti

| Konu | Ne yapıldı |
|---|---|
| E-posta linkleri (kayıt onayı, şifre sıfırlama) | Uygulamadan gönderilse de her zaman `https://rango.com.tr/...` adresine gider (`src/lib/platform.ts`) |
| Paylaş düğmesi | Telefonun kendi paylaşım menüsünü açar, link `rango.com.tr` olur |
| Konum | Telefonun konum servisini kullanır, net bir izin sorusu gösterir |
| Yol tarifi | Google/Apple/Yandex Haritalar uygulamasını doğrudan açar |
| Yasal metin linkleri (kayıt formu vb.) | Uygulama içi tarayıcıda açılır. Yarım kalan form silinmez |
| Android geri tuşu | Önce açık pencereyi kapatır, sonra bir önceki sayfaya döner, ilk sayfada uygulamadan çıkar |
| Durum çubuğu | Açık/koyu temaya göre renk değiştirir |
| Açılış ekranı | Uygulama hazır olunca kapanır |

Bunların hepsi **sitede eskisi gibi çalışır**. Mobil davranışlar yalnızca uygulamanın içinde devreye girer.

---

## 6. (İsteğe bağlı, sonra) Linklerin uygulamada açılması

Biri WhatsApp'tan `rango.com.tr/i/salon-adi` linkine tıkladığında site yerine uygulamanın açılmasını istiyorsan
Android App Links ve iOS Universal Links ayarlanmalı. Bunun için siteye iki doğrulama dosyası eklenir:
`/.well-known/assetlinks.json` ve `/.well-known/apple-app-site-association`.
Uygulama tarafı hazır (`src/lib/native.ts`). Uygulamayı imzaladıktan sonra imza bilgileriyle bu dosyaları birlikte oluşturalım.

---

## 7. Mağaza incelemesi için notlar

- **Hesap silme** uygulamada var (Profil → Verilerim ve gizlilik → Hesabımı sil). Müşteri hesabı hemen silinir; işletme/yönetici hesabı silmeyi uygulama içinden başlatır, Yönetim → Hesap silme talepleri'nden 30 gün içinde tamamlanır. İki mağaza da bunu zorunlu tutuyor.
- **Kullanıcı içeriği:** yorumlar, işletme yanıtları, işletme sayfaları ve mesajlar "Şikâyet et" ile bildirilebilir, sohbette "Engelle" var; şikâyetler Yönetim → Şikâyetler'de 24 saat içinde incelenir (Apple 1.2).
- **Ödeme:** Fiziksel hizmet (kuaför randevusu) ödemeleri Apple/Google uygulama içi satın alma kuralına girmez. iyzico/PayTR kullanılabilir.
- **Gizlilik politikası linki:** Mağaza formlarına `https://rango.com.tr/yasal/aydinlatma-metni` yaz.
- **Test hesabı:** Apple inceleme ekibi için bir müşteri hesabı ve bir işletme hesabı hazırla, bilgilerini inceleme notuna yaz.
- **Apple 4.2 kuralı ("site kopyası"):** Apple bazen yalnızca siteyi gösteren uygulamaları reddedebilir. Rango'nun yerel konum, paylaşım ve harita entegrasyonu
  bu riski azaltır. Ret gelirse sıradaki adım **anlık bildirim** (randevu hatırlatma) eklemek olur. Kenardan kaydırarak geri gitme, takvime ekleme ve paylaşım menüsüyle veri dışa aktarma da uygulamaya özgü özelliklerdir.
