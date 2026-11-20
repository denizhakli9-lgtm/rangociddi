# Rango – Play Store Yayın Rehberi

Android uygulaması hazır. Bu rehber, hazır dosyaları Google Play'e yükleyip yayına almak için
**senin yapman gereken** adımları sırayla anlatır. Kopyala-yapıştır metinler de burada.

| Hazır olan | Nerede |
|---|---|
| İmzalı uygulama paketi (.aab) | Bu oturumda sana gönderilen `rango-1.0.0.aab` (ya da GitHub Actions, bkz. bölüm 7) |
| Telefona kurup denemek için .apk | `rango-1.0.0-test.apk` |
| Yükleme anahtarı (upload key) + şifresi | `rango-imza-anahtari.zip` — **güvenli yerde sakla, kimseyle paylaşma** |
| Simge 512×512 | `play-store/simge-512.png` |
| Tanıtım görseli 1024×500 | `play-store/tanitim-gorseli-1024x500.png` |
| Telefon ekran görüntüleri (1080×1920) | `play-store/ekran-goruntuleri/` |
| Hesap silme web sayfası | `https://rango.com.tr/yasal/kvkk-basvuru` (4. bölüm) — siteyi yeniden dağıtınca yayına girer |

Uygulama bilgileri: paket adı `tr.com.rango.app`, sürüm `1.0.0` (versionCode 1), Android 7.0 ve üzeri,
hedef API 36.

---

## 0. Önce telefonda dene (5 dakika)

`rango-1.0.0-test.apk` dosyasını Android telefonuna gönder, aç, "bilinmeyen kaynaklara izin ver" de ve kur.
Kontrol et: açılış, giriş/kayıt, işletme listesi, "Konumumu kullan" izni, paylaş, yol tarifi, geri tuşu.
Sorun görürsen yayınlamadan önce bana yaz.

---

## 1. Google Play Console hesabı

1. https://play.google.com/console adresinden hesap aç (tek seferlik 25$).
2. Hesap türü:
   - **Kuruluş (şirket):** D-U-N-S numarası gerekir. Avantajı: aşağıdaki 14 günlük test şartı **yok**.
   - **Kişisel:** Kimlik doğrulaması yeterli. Ama yeni kişisel hesaplarda Google, üretime çıkmadan önce
     **en az 12 test kullanıcısıyla 14 gün kesintisiz kapalı test** ister (bölüm 5).
3. Kimlik/adres doğrulaması birkaç gün sürebilir.

---

## 2. Uygulamayı oluştur

**Tüm uygulamalar → Uygulama oluştur**
- Uygulama adı: `Rango: Kuaför ve Spa Randevu`
- Varsayılan dil: Türkçe (tr-TR)
- Uygulama mı oyun mu: **Uygulama**
- Ücretsiz mi ücretli mi: **Ücretsiz**
- Beyanları işaretle → Oluştur

---

## 3. Mağaza girişi (Büyüme → Mağaza varlığı → Ana mağaza girişi)

**Uygulama adı (30):**
```
Rango: Kuaför ve Spa Randevu
```

**Kısa açıklama (80):**
```
İzmir'in seçkin kuaför, berber, spa ve güzellik salonlarından anında randevu al.
```

**Tam açıklama:**
```
Rango, randevunun yeni yolu.

İzmir'in seçkin kuaför, berber, spa, cilt bakımı, manikür-pedikür ve güzellik merkezlerini tek uygulamada keşfet; sana en uygun saati seç, randevunu saniyeler içinde al. Telefonla aramak, mesaj beklemek yok.

NELER YAPABİLİRSİN?
• Keşfet: Semtine ya da konumuna göre yakındaki işletmeleri gör.
• Ara: İşletme, hizmet veya semt adıyla hızlıca bul.
• Karşılaştır: Hizmetleri, fiyatları, süreleri, uzmanları ve yorumları incele.
• Randevu al: Hizmeti ve uzmanı seç, boş saatlerden birini işaretle, onayla.
• Takip et: Randevularını tek ekranda gör, gerekirse iptal et ya da saatini değiştir.
• Favoriler: Sevdiğin salonları kaydet, tek dokunuşla tekrar randevu al.
• Yol tarifi: Google Haritalar, Apple Haritalar veya Yandex ile salona kolayca git.
• Paylaş: Beğendiğin işletmeyi arkadaşlarına gönder.
• Bildirimler ve destek: Randevu durumunu takip et, destek ekibine uygulama içinden yaz.
• Açık ve koyu tema, Türkçe ve İngilizce dil seçeneği.

İŞLETME SAHİPLERİ İÇİN
Rango'da işletmeni listele; hizmetlerini, çalışanlarını ve çalışma saatlerini yönet, gelen randevu taleplerini tek panelden onayla.

GİZLİLİĞİN ÖNEMLİ
Reklam ya da analitik takip yapmıyoruz. Konumun yalnızca yakındaki işletmeleri göstermek için ve sadece sen izin verirsen kullanılır. Hesabını dilediğin an Profil → Hesabımı sil adımıyla silebilirsin.

rango.com.tr
```

**Grafikler:**
- Uygulama simgesi: `play-store/simge-512.png`
- Öne çıkan grafik: `play-store/tanitim-gorseli-1024x500.png`
- Telefon ekran görüntüleri: `play-store/ekran-goruntuleri/` içindeki 6 dosya (sırayla)
  - Not: Görüntülerde şu an sitedeki "Örnek işletme"ler var. Gerçek işletmeler eklendikçe
    telefondan yeni ekran görüntüsü alıp bunlarla değiştirmen iyi olur.
- Tablet ekran görüntüsü zorunlu değil.

**Mağaza ayarları (Mağaza varlığı → Mağaza ayarları):**
- Kategori: **Güzellik** (Beauty)
- E-posta: `deniz.dev@rango.com.tr`
- Web sitesi: `https://rango.com.tr`

---

## 4. Uygulama içeriği (Politika → Uygulama içeriği)

Hepsini doldurmadan yayın gönderilemez.

| Bölüm | Cevap |
|---|---|
| **Gizlilik politikası** | `https://rango.com.tr/yasal/aydinlatma-metni` |
| **Uygulama erişimi** | "Tüm işlevler özel erişim olmadan kullanılamaz" → Google inceleme ekibi için bir **test müşteri hesabı** (e-posta + şifre) yaz. Talimat: "Ara sekmesinde <gerçek bir işletmenin adı> yazıp randevu alınabilir. 'Örnek işletme' etiketli kayıtlar tanıtım amaçlıdır, randevu almaz. Ödeme test modundadır, kart çekimi yapılmaz." (Şu an veritabanında randevu alan 3 gerçek işletme var, birinin adını yaz.) |
| **Reklamlar** | Hayır, reklam içermiyor |
| **İçerik derecelendirmesi** | Anketi doldur. Kategori: "Diğer tüm uygulama türleri". Şiddet, cinsellik, kumar vb. hepsine **Hayır**. "Kullanıcılar birbirleriyle etkileşim kurabiliyor / içerik paylaşabiliyor mu?" → **Evet** (yorumlar ve destek sohbeti). Konum paylaşımı → kullanıcılara gösterilmiyor. Sonuç genelde "3+ / Herkes" olur. |
| **Hedef kitle** | **18 ve üzeri** (yalnızca bunu seç; çocuklara yönelik değil) |
| **Haber uygulaması** | Hayır |
| **COVID-19, devlet uygulaması, finans özellikleri** | Hayır / Yok |
| **Sağlık uygulaması** | Hayır (Spa/masaj sağlık hizmeti sayılmaz; emin değilsen "sağlık özelliği yok") |
| **Hesap silme** | Evet, uygulama hesap oluşturmaya izin veriyor. Silme URL'si: `https://rango.com.tr/yasal/kvkk-basvuru` |
| **Veri güvenliği** | Aşağıdaki tabloyu kullan |

### Veri güvenliği formu

Genel sorular:
- Uygulama kullanıcı verisi topluyor veya paylaşıyor mu? **Evet**
- Tüm veriler aktarım sırasında şifreleniyor mu? **Evet** (HTTPS)
- Kullanıcılar verilerinin silinmesini isteyebilir mi? **Evet**
- Veriler üçüncü taraflarla **paylaşılıyor mu? Hayır** (Supabase barındırma hizmetidir, "paylaşım" sayılmaz;
  destek yapay zekâsı için OpenAI anahtarı tanımlanırsa bu formu güncellemek gerekir)

Toplanan veriler (hepsinde "Paylaşılıyor mu: Hayır", "Geçici olarak işleniyor mu: Hayır"
— konum hariç):

| Veri türü | Zorunlu mu | Amaç |
|---|---|---|
| Kişisel bilgiler → **Ad** | Zorunlu | Uygulama işlevselliği, Hesap yönetimi |
| Kişisel bilgiler → **E-posta adresi** | Zorunlu | Uygulama işlevselliği, Hesap yönetimi, Geliştirici iletişimi |
| Kişisel bilgiler → **Telefon numarası** | Zorunlu | Uygulama işlevselliği, Hesap yönetimi |
| Kişisel bilgiler → **Diğer bilgiler** (cinsiyet) | İsteğe bağlı | Uygulama işlevselliği |
| Konum → **Yaklaşık konum** | İsteğe bağlı | Uygulama işlevselliği |
| Konum → **Kesin konum** | İsteğe bağlı, **geçici olarak işleniyor: Evet** | Uygulama işlevselliği |
| Finansal bilgiler → **Satın alma geçmişi** (randevu/kapora kayıtları) | Zorunlu | Uygulama işlevselliği |
| Finansal bilgiler → **Diğer finansal bilgiler** (yalnızca işletmeler: IBAN) | İsteğe bağlı | Uygulama işlevselliği |
| Mesajlar → **Diğer uygulama içi mesajlar** (destek sohbeti) | İsteğe bağlı | Uygulama işlevselliği, Müşteri desteği |
| Fotoğraflar ve videolar → **Fotoğraflar** (yalnızca işletme görselleri) | İsteğe bağlı | Uygulama işlevselliği |
| Uygulama etkinliği → **Kullanıcı tarafından oluşturulan diğer içerikler** (yorumlar) | İsteğe bağlı | Uygulama işlevselliği |

Toplanmayan: reklam kimliği, cihaz kimliği, kişiler, takvim, analitik, kilitlenme raporları.

---

## 5. Test ve yayın

### Kişisel hesapsan: kapalı test (zorunlu, 14 gün)
1. **Test → Kapalı test → Kanal oluştur** (ör. "Alfa").
2. **Test kullanıcıları:** bir e-posta listesi oluştur, **en az 12 kişinin** Gmail adresini ekle
   (aile, arkadaş, işletme sahipleri). Fazla eklemek iyidir; biri bırakırsa sayı düşmesin.
3. **Yeni sürüm oluştur** → `rango-1.0.0.aab` dosyasını yükle.
   - İlk yüklemede **"Google Play uygulama imzalama"**yı kabul et (önerilen). Böylece asıl imza
     anahtarını Google saklar; bizim anahtar yalnızca "yükleme anahtarı" olur ve kaybolursa yenilenebilir.
   - Sürüm notu: `İlk sürüm.`
4. İncelemeye gönder. Onaylanınca test bağlantısını 12 kişiye gönder; her biri bağlantıdan
   "test kullanıcısı ol"a basıp uygulamayı **Play Store'dan** yüklesin ve 14 gün boyunca silmesin.
5. 14 gün dolunca **Kontrol paneli → Üretime erişim için başvur**. Kısa anketi doldur
   (testçilerden geri bildirim aldın mı, ne düzelttin vb.). Onay genelde birkaç gün sürer.

### Kuruluş hesabıysan ya da kapalı test bittiyse: üretim
1. **Üretim → Ülkeler/bölgeler:** Türkiye (istersen tümü).
2. **Yeni sürüm oluştur** → aynı `.aab` dosyasını (ya da yeni sürümü) yükle → İncelemeye gönder.
3. İlk inceleme birkaç gün sürebilir. Onaylanınca uygulama Play Store'da görünür.

---

## 6. Güncelleme yayınlarken

1. `android/app/build.gradle` içinde `versionCode`'u **1 artır** (1 → 2 → 3 …) ve
   `versionName`'i değiştir (1.0.0 → 1.0.1). Aynı versionCode ikinci kez yüklenemez.
2. Yeni `.aab` derle (bölüm 7) ve Play Console'da yeni sürüm olarak yükle.

Web kodunda (`src/`) yapılan her değişiklik, uygulamaya ancak yeni sürüm yüklenince gelir.
Siteyi Hostinger'da güncellemek uygulamayı güncellemez.

---

## 7. Yeni .aab nasıl derlenir

### Yol A – GitHub Actions (bilgisayar gerekmez, önerilen)
Bir kerelik: GitHub'da depo → **Settings → Secrets and variables → Actions → New repository secret**
ile `rango-imza-anahtari.zip` içindeki `IMZA-BILGILERI.txt`'de yazan 4 değeri ekle:
`RANGO_KEYSTORE_BASE64`, `RANGO_KEYSTORE_PASSWORD`, `RANGO_KEY_ALIAS`, `RANGO_KEY_PASSWORD`.

Her derlemede: **Actions → Android (Play Store) → Run workflow**. Bitince çalışmanın sayfasındaki
**Artifacts** bölümünden `rango-play-store-aab` indir (zip içinden `.aab` çıkar).

### Yol B – Bilgisayarda Android Studio ile
1. `rango-upload.jks`'yi `android/` klasörüne koy ve aynı klasörde `keystore.properties` oluştur:
   ```
   storeFile=rango-upload.jks
   storePassword=<şifre>
   keyAlias=rango-upload
   keyPassword=<şifre>
   ```
   (Bu iki dosya `.gitignore`'da, GitHub'a gitmez.)
2. Proje kökünde:
   ```bash
   npm ci && npm run build && npx cap sync android
   ```
   ```bash
   cd android && ./gradlew bundleRelease
   ```
3. Dosya: `android/app/build/outputs/bundle/release/app-release.aab`

---

## 8. Sonra yapılabilecekler

- **Linklerin uygulamada açılması (App Links):** Play'e ilk yüklemeden sonra Play Console →
  Uygulama imzalama sayfasındaki SHA-256 parmak iziyle `/.well-known/assetlinks.json` oluşturulur.
- **Anlık bildirim** (randevu hatırlatma): Firebase kurulumu gerekir.
- **Uygulama boyutu:** Paket ~24 MB; büyük kısmı `public/sector-*.webp` görselleri (her biri ~1,6 MB).
  Sıkıştırılırsa indirme boyutu belirgin düşer.
