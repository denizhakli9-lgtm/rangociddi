# Rango – App Store'da yayınlama rehberi (M1 MacBook ile)

Bu rehber, Rango'nun iPhone uygulamasını sıfırdan App Store'a çıkarmak için gereken her adımı sırayla anlatır.
Kodla ilgili hazırlıklar tamam: `ios/` projesi, izin metinleri, gizlilik bildirimi, çentik/klavye ayarları,
şikâyet/engelleme, yapay zekâ onayı ve uygulama içi hesap silme depoda hazır.
Senin yapacakların: Apple hesabı, veritabanı güncellemesi, Mac'te derleme, App Store Connect formları ve gönderim.

> **Depo herkese açık.** Bu dosyaya ya da başka bir dosyaya **şifre, demo hesap şifresi, Apple kimlik bilgisi yazma.**
> Bunlar yalnızca App Store Connect'teki ilgili kutulara girilir.

Süre tahmini: Apple üyelik onayı 1–3 gün (şirket hesabında D-U-N-S ile 1–2 hafta), senin işin 1 gün,
Apple incelemesi genelde 1–2 gün.

---

## Adım 1 – Apple Developer Program üyeliği (hemen başlat, onay bekletir)

**Bireysel mi, şirket mi?**

| | Bireysel (Individual) | Şirket (Organization) |
|---|---|---|
| App Store'da satıcı adı | Adın soyadın | "Rango Bilgisayar ve Yazılım…" |
| Gerekenler | Apple hesabı, kimlik | Tüzel kişilik, **D-U-N-S numarası**, şirket alan adlı e-posta (`@rango.com.tr` var), imza yetkisi |
| Süre | Genelde 1–2 gün | D-U-N-S yoksa 1–2 hafta daha |

- Şirket **Ltd./A.Ş. gibi tüzel kişiyse** → **Organization** önerilir. Mağazada şirket adı görünür, yasal metinlerle uyumlu olur.
  D-U-N-S numaranı Apple'ın sayfasından sorgula ya da ücretsiz al: https://developer.apple.com/support/D-U-N-S/
- **Şahıs şirketiysen** Apple seni bireysel sayar → **Individual**.
- Ücret: yıllık 99 USD (Türkiye'de TL karşılığı gösterilir). Yurt dışı internet alışverişine açık bir kart gerekir.

**Kayıt:**
1. Apple hesabında **iki adımlı doğrulama** açık olsun. Hesaptaki ad soyad, kimliğindekiyle aynı olmalı.
2. iPhone'a App Store'dan **Apple Developer** uygulamasını kur → **Account → Enroll Now**.
3. Kimlik doğrulaması (TC kimlik kartı olmazsa pasaport), açık adres, ödeme.
4. 24 saatte "Welcome" e-postası gelmezse: https://developer.apple.com/contact/ (Enrollment ID ile).
5. Onay gelince https://developer.apple.com/account adresinden **Team ID**'ni not et (10 karakter). Bu gizli bir bilgi değil. Rango'nunki `VYVFYV3996`; projeye işlendi.

---

## Adım 2 – Mac'i hazırla

1. **macOS'i güncelle:** Sistem Ayarları → Genel → Yazılım Güncelleme → en güncel **macOS Tahoe 26.x**. M1 bunu çalıştırır.
   Apple 28 Nisan 2026'dan beri yalnızca **Xcode 26 veya üstü** ile derlenen uygulamaları kabul ediyor. Capacitor 8 de en az Xcode 26 istiyor.
2. Mac App Store'dan **Xcode**'u kur (büyük dosya, uzun sürer). Bir kez aç, iOS bileşenlerini indirmesine izin ver.
   Xcode → Settings → **Accounts** → `+` → Apple hesabınla giriş yap.
3. Terminal'i aç (Spotlight: "Terminal"), komut satırı araçlarını seç:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app
   ```
4. **Node.js 22 LTS**'i kur: https://nodejs.org (macOS Installer, .pkg).
5. Projeyi indir (GitHub'a giriş ister):
   ```bash
   cd ~/Documents && git clone https://github.com/denizhakli9-lgtm/rangociddi.git && cd rangociddi
   ```
6. `.env` dosyası sitedekiyle aynı olmalı (`MOBIL-REHBERI.md` 1. bölüm). Yoksa varsayılan değerler kullanılır; yine de koy.

---

## Adım 3 – Veritabanı ve sunucu (uygulamayı göndermeden ÖNCE)

Yeni özellikler (şikâyet/engelleme, yapay zekâ onayı, hesap silme talebi) iki yeni migration ister. İkisi de **yalnızca ekleme** yapar; yayındaki site etkilenmez.

**28 Kasım 2026'da yapıldı** (Frankfurt projesi, Supabase bağlantısıyla):

1. ✅ `supabase/migrations/20261127140000_content_reports_and_chat_blocks.sql`
2. ✅ `supabase/migrations/20261127150000_support_ai_consent_and_deletion_requests.sql`
3. ✅ **support-ai** Edge Function'ı yeniden yayınlandı (sürüm 3; yayındaki dosya depodakiyle bayt bayt aynı).
4. ✅ Supabase → Advisors → Security: yeni tablolar için uyarı yok (yalnızca `private` şemasındaki PayTR tabloları için bilinen 3 bilgi notu).
5. Bu dal `main`'e alınıp site yayınlanır. Uygulama ile site aynı kodu kullanır; App Review site üzerinden de bakabilir.

Uygulamadan önce kontrol edildi: değiştirilen fonksiyonlar (`send_appointment_message`, `run_retention`,
`support_claim_ai`, `support_action`) ve `appointment_messages` okuma kuralı canlıdaki hâlleriyle aynı temelden geliyor;
eski sürümler (Play'deki Android 1.45 ve eski site) çalışmaya devam ediyor. Onları kullananların destek konuşmaları
yapay zekâ yerine doğrudan bir kişiye gider.

Sonra:
- En az bir yönetici **Yönetim → Şikâyetler** sayfasına her gün baksın. Apple şikâyetlere **24 saat** içinde işlem yapılmasını bekliyor; Kullanım Koşulları artık bunu taahhüt ediyor.
- **Yönetim → Hesap silme talepleri**: işletme/yönetici silme talepleri en geç 30 gün içinde sonuçlandırılır.
- Kullanım Koşulları'na madde eklendiği için `src/lib/legal.ts` içindeki `LEGAL_VERSIONS.terms` ve `LEGAL_UPDATED_AT` değerlerini güncellemeyi düşün.

---

## Adım 4 – App Review'un uygulamayı deneyebilmesi (en sık ret sebebi)

Apple inceleme ekibi uygulamada **bir randevuyu baştan sona alabilmeli.** Şu an durum:
- Canlı veritabanında 24 işletmenin **19'u "Örnek işletme / randevu alınamaz"**, kategorilerin çoğu **"Yakında"**. İnceleme ekibi bunu yarım içerik (kural 2.1) sayabilir.
- Ödeme **canlı modda** (PayTR). İnceleme ekibi gerçek kartla ödeme yapmaz; gerçek bir salona sahte randevu da düşmemeli.

Yapılacaklar:
1. **Demo işletme:** kendi hesabına bağlı "Rango Demo Kuaför" gibi bir işletme aç. Onaylı olsun; 3+ hizmet, 1–2 çalışan, çalışma saatleri ve kendi çektiğin fotoğraflar eklensin.
   **Kaporayı 0 yap.** Böylece randevu ödeme ekranına gitmeden onaylanır.
2. **İki demo hesap** (e-posta + şifre, e-postası onaylı, **süresi dolmayan**):
   - Müşteri: ör. `appreview.musteri@rango.com.tr`. Bu hesapla demo işletmeden 1 randevu al ve işletmeyle birkaç mesaj yazış. İnceleyici sohbeti, şikâyeti ve engellemeyi böylece görebilir.
   - İşletme sahibi: demo işletmenin sahibi.
   Şifreleri yalnızca App Store Connect'e yaz.
3. **Örnek işletmeler:** gönderimden önce ya gizle (durumu askıya al) ya da gerçek işletme sayısı onları geçsin.
   Hizmeti olmayan gerçek işletmeleri hizmet eklenene kadar gizle. Boş kategorileri ("Yakında") listede alta al ya da gizle.
4. **İletişim bilgisi:** `src/lib/legal.ts` → `COMPANY.address` yalnızca "Karabağlar / İzmir", `phone` boş.
   Apple'ın **Support URL** kuralı açık adres, e-posta ve telefon istiyor. Tam adresi ve bir telefon numarasını yaz.
   Bunlar https://rango.com.tr/yasal/kunye sayfasında görünür; o adres Support URL olarak kullanılacak.

---

## Adım 5 – Uygulamayı Mac'te derle ve dene

```bash
npm ci
```
```bash
npm run ios
```
Bu komut siteyi derler; `ios/` projesini hazırlar (simge, açılış ekranı, izin metinleri, gizlilik bildirimi, sürüm) ve Xcode'u açar.
Rango'nun Team ID'si (`VYVFYV3996`) projeye işlendi; ayrıca yazman gerekmez. Xcode'da **App** projesi → **App** hedefi →
**Signing & Capabilities** altında "Automatically manage signing" işaretli ve **Team** Apple hesabın olmalı; Xcode bir kez
Apple hesabınla giriş yapmanı isteyebilir (Xcode → Settings → Accounts). Bundle Identifier `tr.com.rango.app` olmalı, **değiştirme**.

**Simülatörde dene:** Xcode üst çubuğunda cihaz olarak **iPhone 17 Pro Max**'i seç → ▶ (Run).
**Kendi iPhone'unda dene (önerilir):** iPhone'u kabloyla bağla. iPhone'da Ayarlar → Gizlilik ve Güvenlik → **Geliştirici Modu**'nu aç. Xcode'da cihazı seç → ▶.

Kontrol listesi. Hepsini en az bir kez dene:
- [ ] Üst başlık saat/Dynamic Island'ın altında, alt sekme çubuğu ana ekran çizgisinin üstünde. Açılışta siyah şerit yok.
- [ ] Bir forma dokununca ekran **yakınlaşmıyor**. Klavye açılınca alt çubuklar gizleniyor, kapanınca geri geliyor.
- [ ] Ekranın sol kenarından sağa kaydırınca bir önceki sayfaya dönülüyor.
- [ ] "Konumumu kullan": izin penceresi çıkıyor, yükleniyor simgesi takılı kalmıyor. "İzin Verme" deyince Ayarlar'a yönlendiren mesaj çıkıyor.
- [ ] İşletme sayfası → **Yol tarifi al** → Apple Haritalar açılıyor. **Paylaş** → iPhone paylaşım menüsü açılıyor.
- [ ] Yasal metin linki uygulama içi tarayıcıda açılıyor; **Bitti** deyince saat/pil simgeleri okunur kalıyor.
- [ ] Demo müşteriyle randevu al → onay ekranı → **Takvime ekle** çalışıyor.
- [ ] (Test kartıyla, test modunda) PayTR ödemesi → sayfa kapanıyor ya da **Bitti** sonrası onay ekranına geçiliyor.
- [ ] İşletme hesabıyla kapak fotoğrafı: **Fotoğraf Çek** (kamera izni soruluyor, uygulama kapanmıyor) ve **Fotoğraf Arşivi**. Büyük iPhone fotoğrafı da yükleniyor.
- [ ] Bir yorumda **Şikâyet et**, randevu sohbetinde mesaj bayrağı ve **Engelle / Engeli kaldır** çalışıyor. Şikâyet yönetimde görünüyor.
- [ ] Yardım ve Destek → konuşma başlat → **yapay zekâ onay penceresi** çıkıyor. "Hayır" seçilince yapay zekâ yanıt vermiyor.
- [ ] Profil → Verilerim ve gizlilik → **Verilerimin kopyasını al** paylaşım menüsünü açıyor. **Hesabımı sil**: müşteride hemen siliyor, işletmede talep oluşturup oturumu kapatıyor.
- [ ] Koyu tema ve İngilizce (EN) seçenekleri düzgün.

---

## Adım 6 – App Store Connect'te uygulama kaydı

https://appstoreconnect.apple.com

1. **Business** (Agreements): bekleyen sözleşmeyi kabul et. Uygulama ücretsiz ve uygulama içi satış yok; ücretli uygulama sözleşmesi, banka ve vergi formu **gerekmez**.
2. **Apps → `+` → New App:**
   - Platform: **iOS**
   - Name: **Rango** (alınmışsa `Rango: Kuaför & Berber Randevu`. Telefonda simgenin altında yine "Rango" yazar.)
   - Primary Language: **Turkish**
   - Bundle ID: **tr.com.rango.app** (Xcode'da ilk derlemeden sonra listede çıkar; çıkmazsa developer.apple.com → Identifiers'dan ekle)
   - SKU: `rango-ios-001` (sana özel, değişmez, mağazada görünmez)
   - User Access: Full Access
3. **App Information:**
   - Category: **Lifestyle** (birincil), **Business** (ikincil)
   - Content Rights: üçüncü taraf içerik yok. İşletme fotoğrafları işletmelerin kendi yüklemesi; "does not contain…" seçeneğini işaretle.
   - Age Rating → **Edit**: dürüstçe cevapla. **User-Generated Content: Evet** (yorumlar, işletme yanıtları, fotoğraflar, mesajlaşma).
     Şiddet, kumar, alkol, tıbbi içerik: **Hayır**. **Unrestricted Web Access: Hayır.** Sonuç büyük olasılıkla 13+ ya da benzeri çıkar; sorun değil.
4. **Pricing and Availability:** Ücretsiz. **Availability: yalnızca Türkiye.** AB ülkeleri seçilirse kişisel adres/telefon AB sayfalarında yayınlanır (DSA).
   **Apple silicon Mac** ve **Apple Vision Pro**'da sunma seçeneklerinin işaretini kaldır.
5. **Business → Compliance (DSA):** trader durumu sorulur. Yalnızca Türkiye'de dağıtıyorsan **AB'de trader değilim** seçeneği uygundur.

### Mağaza metinleri (Türkçe, 1.0 sürüm sayfası)

**Subtitle (30 karakter):**
```
Kuaför, berber, güzellik
```

**Promotional Text (170 karakter, inceleme olmadan değiştirilebilir):**
```
İzmir'deki kuaför, berber ve güzellik salonlarını keşfedin; hizmetleri ve fiyatları karşılaştırın, uygun saati seçip saniyeler içinde randevunuzu alın.
```

**Description:**
```
Rango ile kuaför, berber ve güzellik randevusu almak telefon trafiği olmadan, birkaç dokunuşla biter.

İzmir'deki salonları keşfedin
• Kuaför, berber, manikür-pedikür, cilt bakımı, spa ve masaj işletmelerini tek yerde görün.
• "Konumumu kullan" ile size en yakın salonları mesafeye göre sıralayın.
• Hizmetleri, fiyatları, çalışanları, çalışma saatlerini ve müşteri yorumlarını inceleyin.

Saatinizi seçin, randevunuz hazır
• Hizmeti ve dilerseniz çalışanı seçin, uygun saatlerden birine dokunun.
• Kapora isteyen işletmelerde ödemeyi güvenli PayTR ödeme sayfasıyla yapın.
• Randevularınızı tek ekranda görün, takviminize ekleyin, işletmeyle mesajlaşın.

İşletmeniz için
• Salonunuzu Rango'ya ekleyin; hizmetlerinizi, çalışanlarınızı ve saatlerinizi yönetin.
• Gelen randevuları onaylayın, takviminizi ve kazançlarınızı takip edin.

Güven ve gizlilik
• Uygunsuz içerikleri tek dokunuşla şikâyet edebilir, rahatsız eden kullanıcıları engelleyebilirsiniz.
• Reklam veya izleme yoktur. Hesabınızı ve verilerinizi uygulama içinden silebilirsiniz.

Rango şu anda İzmir'de hizmet veriyor.
```

**Keywords (en fazla 100 bayt; Türkçe harfler 2 bayt sayılır, virgülle, boşluksuz):**
```
kuaför,berber,randevu,güzellik,manikür,pedikür,cilt bakımı,spa,masaj,salon,izmir,saç,sakal
```

- **Support URL:** `https://rango.com.tr/yasal/kunye` (önce Adım 4.4'teki adres/telefonu doldur)
- **Marketing URL:** `https://rango.com.tr`
- **Privacy Policy URL** (App Privacy bölümünde): `https://rango.com.tr/yasal/aydinlatma-metni`
- **Copyright:** `2026 Rango Bilgisayar ve Yazılım Şirketi`

### Ekran görüntüleri

`magaza/ios/ekran-goruntuleri/` klasöründe 5 hazır görüntü var. Hepsi **1320 × 2868** (6,9" iPhone), uygulama görünümünde ve canlı verilerle alındı.
Sürüm sayfasında **iPhone 6.9" Display** kutusuna sırayla sürükle. iPad görüntüsü gerekmez; uygulama yalnızca iPhone için.
İstersen demo işletmeyi açtıktan sonra simülatörde **iPhone 17 Pro Max** → `Cmd + S` ile kendi görüntülerini de alabilirsin. Randevu ve onay ekranları iyi olur.

### App Privacy (Uygulama Gizliliği) cevapları

Uygulamanın içindeki gizlilik bildirimi (`scripts/ios/PrivacyInfo.xcprivacy`) bu cevaplarla birebir aynı.
"Do you or your third-party partners collect data from this app?" → **Yes**. "Used for tracking?" → **No** (hiçbirinde).

| Veri türü | Toplanıyor | Kimliğe bağlı | Amaç |
|---|---|---|---|
| Contact Info → Name, Email Address, Phone Number | Evet | Evet | App Functionality |
| Contact Info → Physical Address (işletme adresi) | Evet | Evet | App Functionality |
| Location → Coarse Location (müşterinin semti) | Evet | Evet | App Functionality |
| Location → Precise Location (işletmenin harita pini) | Evet | Evet | App Functionality |
| Financial Info → Payment Info (işletmenin IBAN'ı) | Evet | Evet | App Functionality |
| Financial Info → Other Financial Info (kazanç, komisyon) | Evet | Evet | App Functionality |
| Purchases → Purchase History (randevu/ödemeler) | Evet | Evet | App Functionality |
| Identifiers → User ID | Evet | Evet | App Functionality |
| User Content → Photos or Videos (işletme fotoğrafları) | Evet | Evet | App Functionality |
| User Content → Emails or Text Messages (randevu sohbeti) | Evet | Evet | App Functionality |
| User Content → Customer Support (destek; onayla OpenAI'ye) | Evet | Evet | App Functionality |
| User Content → Other User Content (yorumlar, notlar, favoriler) | Evet | Evet | App Functionality |
| Other Data → Other Data Types (isteğe bağlı cinsiyet) | Evet | Evet | App Functionality |

Diğer her şey (sağlık, kişiler, arama geçmişi, tarama geçmişi, cihaz kimliği, reklam verisi, çökme/analitik…) → **toplanmıyor**.
Kart numarası PayTR'nin sayfasında girilir; Rango toplamaz.

---

## Adım 7 – Arşivle ve yükle

1. Kodda değişiklik olduysa:
   ```bash
   npm run ios
   ```
2. Xcode üst çubuğunda cihaz: **Any iOS Device (arm64)**.
3. **Product → Archive.** Bitince **Organizer** açılır.
4. Arşivi seç → **Distribute App** → **App Store Connect** → **Distribute**. Otomatik imzalama ve sembol yükleme açık kalsın.
5. 10–30 dakika içinde "processing completed" e-postası gelir. Uyarı e-postası (ITMS-…) gelirse içeriğini bana ilet.
   İstersen Organizer'da arşive sağ tıklayıp **Generate Privacy Report** ile gizlilik raporunu da kontrol et.

**Sonraki her yüklemede** derleme numarasını artır (aynı numara ikinci kez kabul edilmez):
```bash
IOS_BUILD_NUMBER=2 npm run ios
```
Yeni sürüm (ör. 1.0.1) için `IOS_VERSION=1.0.1 IOS_BUILD_NUMBER=3 …`.

---

## Adım 8 – TestFlight'ta dene

1. App Store Connect → uygulama → **TestFlight** → **Internal Testing** → `+` → grup oluştur, kendini ekle, derlemeyi seç.
2. iPhone'a **TestFlight** uygulamasını kur → daveti kabul et → Rango'yu yükle.
3. Adım 5'teki kontrol listesini gerçek mağaza derlemesinde bir kez daha geç. PayTR ve konumu mutlaka gerçek telefonda dene.

---

## Adım 9 – İncelemeye gönder

Sürüm sayfasında (iOS App 1.0):
- **Build:** TestFlight'ta denediğin derlemeyi seç.
- **App Review Information → Sign-in required:** demo **müşteri** hesabının e-posta/şifresi.
- **Contact Information:** adın, telefonun, e-postan (Apple ulaşamazsa reddeder).
- **Notes** (İngilizce yaz; şifreleri buraya da yazabilirsin, burası gizli):

```
Rango is a booking marketplace for hair, barber and beauty salons in İzmir, Türkiye.
The UI is Turkish by default; tap "EN" in the top bar to switch to English.

Demo accounts (non-expiring):
- Customer (Sign-in section above): browse, book "Rango Demo Kuaför", see bookings and chat.
- Business owner: <e-posta> / <şifre> – manages the demo salon (services, staff, hours, calendar).
Browsing salons works without an account (tap "Atla" / "Browse without an account").

Booking: the demo salon takes no deposit, so a booking is confirmed without payment.
Some salons ask for a deposit; it is paid by card on PayTR's secure page (Turkish payment provider)
and is for an in-person service at the salon (guideline 3.1.3(e)), so In-App Purchase does not apply.

User-generated content (guideline 1.2): reviews, owner replies, business pages and chat messages
can be reported with "Şikâyet et / Report"; users can block each other in the booking chat
("Engelle / Block"). Reports reach our moderators, who act within 24 hours (Terms, section 4).

Support chat: messages are sent to an AI assistant (OpenAI) only after the user gives explicit
in-app consent; otherwise they go to a human agent.

Account deletion: Profile > Verilerim ve gizlilik > Hesabımı sil. Customer accounts are deleted
immediately; business accounts start the deletion in-app and it is completed within 30 days.

Native features: location (nearest salons; the business owner's shop pin), native share sheet,
Apple Maps directions, add to calendar, photo upload with camera/library, edge-swipe back.
Admin and field-staff tools are internal and not part of the reviewed experience.
```
- **Version Release:** ilk sürüm için **Manually release this version**. Onay gelince yayın düğmesine sen basarsın.
- **Add for Review → Submit.**

---

## Ret gelirse

Apple'ın mesajını (Resolution Center) olduğu gibi bana ilet. Sık görülenler ve hazır karşılıkları:

| Kural | Neden | Yapılacak |
|---|---|---|
| 2.1 Information Needed / Completeness | Demo hesap çalışmadı, randevu alınamadı | Hesapları ve demo işletmeyi kontrol et, notu netleştir |
| 4.2 Minimum Functionality ("web sitesi kopyası") | Uygulama siteye çok benziyor | Sıradaki adım **anlık bildirimler** (randevu onayı, hatırlatma, yeni mesaj). Yanıtta mevcut yerel özellikleri listele |
| 1.2 UGC | Şikâyet/engelleme bulunamadı | Nerede olduklarını ekran görüntüsüyle yanıtla |
| 5.1.1 | İzin metni belirsiz ya da üyelik zorunlu görünüyor | Metinler hazır; gerekirse birlikte değiştiririz |
| 2.3 Metadata | Ekran görüntüsü/metin uygulamayla uyuşmuyor | Görüntüleri güncel derlemeden yeniden al |

---

## Sonraki adımlar (isteğe bağlı)

- **Anlık bildirimler** (APNs): 4.2 riskini en çok azaltan özellik; ilk sürümden sonra eklenebilir.
- **Universal Links:** `rango.com.tr` linklerinin (e-posta onayı, şifre sıfırlama, paylaşılan işletme linkleri) doğrudan uygulamada açılması.
  Team ID'yi verince siteye `/.well-known/apple-app-site-association` dosyasını ve uygulamaya Associated Domains ayarını ekleriz.
- **GitHub'dan otomatik TestFlight yüklemesi:** App Store Connect API anahtarıyla, Android'deki gibi. İlk elle yüklemeden sonra kurulabilir.

---

## Sorun giderme

| Belirti | Çözüm |
|---|---|
| Xcode "Missing package product" / paketler çözülmüyor | Önce `npm ci` ve `npm run ios`; olmazsa Xcode → File → Packages → **Reset Package Caches** |
| "No Account for Team" / "Signing requires a development team" | Xcode → Settings → Accounts'ta giriş yap, Signing & Capabilities'te Team seç |
| "Failed to register bundle identifier" | `tr.com.rango.app` başka bir hesapta kayıtlı olabilir; bana yaz |
| Yüklemede "Redundant Binary" / build number hatası | `IOS_BUILD_NUMBER`'ı artır |
| ITMS-90683 (Missing purpose string) | `scripts/ios-prepare.mjs` içindeki izin metinlerine bak; e-postayı bana ilet |
| ITMS-91053 (privacy manifest) | `scripts/ios/PrivacyInfo.xcprivacy`'ye istenen API nedeni eklenir; e-postayı bana ilet |
| Uygulama açılışta beyaz/siyah ekranda kalıyor | `npm run ios` çalıştırılmadan Xcode'dan derlenmiş olabilir (web dosyaları kopyalanmamış) |
