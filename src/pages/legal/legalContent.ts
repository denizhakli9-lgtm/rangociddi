// Göreli import: bu dosyayı derleme eklentisi de okur (seo/prerender.ts); orada "@/" takma adı yoktur.
import { COMPANY, LEGAL_UPDATED_AT, LEGAL_VERSIONS, PAYMENT_PROVIDER, SALE_CONSENT_TEXT, SALE_CONSENT_TEXT_TEST, filled, type LegalSlug } from '../../lib/legal';
import { WHATSAPP_SUPPORT } from '../../lib/contact';

const PAYTR_PAGE = `${PAYMENT_PROVIDER.shortName}’nin güvenli ödeme sayfasında (${PAYMENT_PROVIDER.website.replace('https://', '')})`;

/**
 * Cayma hakkı (Mesafeli Sözleşmeler Yönetmeliği md. 5/1-g, ğ, h; md. 9, 12, 15/1-h). The sales agreement and
 * the cancellation & refund policy quote the same wording, so they can never drift apart.
 */
const CAYMA_HAKKI = [
  'Müşteri, sözleşmenin kurulduğu günden itibaren 14 gün içinde ve hizmetin ifasına başlanmadan önce, herhangi bir gerekçe göstermeksizin ve cezai şart ödemeksizin sözleşmeden cayabilir.',
  `Cayma bildirimi, Randevularım sayfasındaki “İptal et” seçeneğiyle veya ${COMPANY.email} adresine yazılı olarak yapılabilir.`,
  `Cayma halinde ödenen kapora, bildirimin ulaştığı tarihten itibaren en geç 14 gün içinde, ödemede kullanılan karta ${PAYMENT_PROVIDER.shortName} aracılığıyla iade edilir. Platform test modundayken karttan tahsilat yapılmadığından iade de gerekmez.`,
  'Cayma süresi dolmadan Müşteri’nin onayıyla ifasına başlanan hizmetlerde cayma hakkı sona erer (Mesafeli Sözleşmeler Yönetmeliği md. 15/1-h).',
  'Ücretsiz iptal süresinden sonra yapılan iptallerde kaporanın iade edilmemesine ilişkin kural, yalnızca cayma süresi sona erdikten sonra yapılan iptallere uygulanır. Bildirimde bulunmaksızın randevuya gelinmemesi cayma bildirimi sayılmaz.',
];

/** Tüketici uyuşmazlıkları: Tüketici Hakem Heyeti, üst sınırın üzerinde dava şartı arabuluculuk (6502 s. Kanun md. 68, 73/A). */
const TUKETICI_UYUSMAZLIK =
  'Ticaret Bakanlığınca her yıl ilan edilen parasal sınırlar dahilinde tüketici, yerleşim yerinin bulunduğu veya tüketici işleminin yapıldığı yerdeki Tüketici Hakem Heyetine başvurabilir; bu sınırları aşan uyuşmazlıklarda, 6502 sayılı Kanun md. 73/A uyarınca dava şartı olan arabuluculuğa başvurduktan sonra Tüketici Mahkemesinde dava açabilir.';

export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  slug: LegalSlug;
  eyebrow: string;
  title: string;
  summary: string;
  sections: LegalSection[];
}

const p = (text: string): LegalBlock => ({ kind: 'p', text });
const ul = (...items: string[]): LegalBlock => ({ kind: 'ul', items });
const table = (head: string[], rows: string[][]): LegalBlock => ({ kind: 'table', head, rows });

const controller = `${COMPANY.legalName} (“${COMPANY.brand}”, “Şirket” veya “biz”)`;
const contactLine = [
  `Adres: ${COMPANY.address}`,
  `E-posta: ${COMPANY.kvkkEmail}`,
  filled(COMPANY.kep) ? `KEP: ${COMPANY.kep}` : '',
  filled(COMPANY.phone) ? `Telefon: ${COMPANY.phone}` : '',
]
  .filter(Boolean)
  .join(' · ');

const writtenChannels = filled(COMPANY.kep)
  ? `yazılı olarak, KEP adresimize, sistemimizde kayıtlı e-posta adresinizden ${COMPANY.kvkkEmail} adresine ya da uygulamaya giriş yaparak Destek merkezinden`
  : `yazılı olarak, sistemimizde kayıtlı e-posta adresinizden ${COMPANY.kvkkEmail} adresine ya da uygulamaya giriş yaparak Destek merkezinden`;

const aydinlatma: LegalDocument = {
  slug: 'aydinlatma-metni',
  eyebrow: 'KVKK',
  title: 'Kişisel Verilerin Korunması Aydınlatma Metni',
  summary: `6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) ve Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ uyarınca, ${COMPANY.brand} platformunu kullanan müşteri, işletme sahibi ve ziyaretçilerin kişisel verilerinin nasıl işlendiğini açıklarız. Son güncelleme: ${LEGAL_UPDATED_AT}.`,
  sections: [
    {
      title: '1. Veri sorumlusu',
      blocks: [
        p(`Kişisel verileriniz, veri sorumlusu sıfatıyla ${controller} tarafından işlenmektedir.`),
        p(contactLine),
        p(`${COMPANY.brand}, müşteriler ile hizmet sunan işletmeleri bir araya getiren bir aracı platformdur. Randevu aldığınız işletme, size sunduğu hizmet kapsamında işlediği veriler bakımından ayrıca kendi başına veri sorumlusudur.`),
      ],
    },
    {
      title: '2. İşlenen kişisel veriler',
      blocks: [
        table(
          ['Veri kategorisi', 'Örnekler', 'Kimden'],
          [
            ['Kimlik', 'Ad soyad; isteğe bağlı cinsiyet bilgisi', 'Müşteri, işletme sahibi'],
            ['İletişim', 'E-posta adresi, telefon numarası (işletme sahipleri e-posta adresi vermeden yalnızca cep telefonu numarasıyla da üye olabilir; bu durumda telefon numarası giriş bilgisi olarak da kullanılır); işletmeler için işletme telefonu, e-postası ve adresi', 'Müşteri, işletme sahibi'],
            ['Müşteri işlem', 'Randevu bilgileri (işletme, hizmet, çalışan, tarih-saat, randevu notu, durum, iptal nedeni), favoriler, bildirimler, değerlendirme ve yorumlar', 'Müşteri'],
            ['Hukuki işlem', 'Satış onayı kaydı (onay tarihi ve saati, kabul edilen sözleşme sürümü ve dili, onay anındaki işletme, hizmet, randevu ve tutar bilgileri); harcama itirazı ve iade süreçlerine ilişkin kayıtlar', 'Müşteri'],
            ['Konum', 'Seçtiğiniz semt/ilçe ve yaklaşık (yaklaşık 1 km hassasiyetinde) koordinat; konum izni verirseniz cihaz konumunuz yalnızca size yakın işletmeleri bulmak için kullanılır', 'Müşteri, işletme sahibi'],
            ['Finans', 'Kapora tutarı, ödeme durumu, ödeme kuruluşu işlem numarası, kart markası ve kartın son 4 hanesi, iade kayıtları; işletmeler için IBAN, hesap sahibi adı, banka adı, komisyon ve hak ediş kayıtları', 'Müşteri, işletme sahibi'],
            ['Müşteri destek', 'Destek talebi konusu ve yazışma içerikleri', 'Müşteri, işletme sahibi'],
            ['Görsel', 'Profil fotoğrafı; işletmenin yüklediği logo, kapak, galeri ve çalışan fotoğrafları', 'Müşteri, işletme sahibi'],
            ['İşlem güvenliği', 'Hesap ve oturum bilgileri (telefon numarasıyla üye olan işletme sahipleri için telefon numarasından türetilen ve e-posta gönderiminde kullanılmayan teknik giriş tanımlayıcısı dahil), şifrenin geri döndürülemez şekilde şifrelenmiş hali, IP adresi, erişim ve işlem kayıtları', 'Tüm kullanıcılar ve ziyaretçiler'],
          ],
        ),
        p('Kart numarası, son kullanma tarihi ve güvenlik kodu gibi kart bilgileriniz tarafımızca alınmaz ve saklanmaz; bu bilgiler doğrudan lisanslı ödeme kuruluşu tarafından işlenir. Platformda özel nitelikli kişisel veri (sağlık, biyometrik veri vb.) talep edilmez; randevu notlarına bu tür bilgileri yazmamanızı rica ederiz.'),
      ],
    },
    {
      title: '3. İşleme amaçları ve hukuki sebepler',
      blocks: [
        table(
          ['Amaç', 'Hukuki sebep (KVKK md. 5/2)'],
          [
            ['Üyelik oluşturulması, hesabın yönetilmesi ve kimlik doğrulama', 'Sözleşmenin kurulması ve ifası (c)'],
            ['Randevunun oluşturulması, işletmeye iletilmesi, onay/ret, iptal, erteleme ve hatırlatma bildirimlerinin gönderilmesi', 'Sözleşmenin kurulması ve ifası (c)'],
            ['Kaporanın tahsili, iadesi, komisyon ve işletme hak edişlerinin hesaplanması ve ödenmesi', 'Sözleşmenin ifası (c), hukuki yükümlülük (ç)'],
            ['Konumunuza ve tercihlerinize göre işletmelerin listelenmesi ve sıralanması', 'Sözleşmenin ifası (c), meşru menfaat (f)'],
            ['Destek taleplerinin yanıtlanması (yapay zekâ destekli ön yanıt dahil)', 'Sözleşmenin ifası (c), meşru menfaat (f)'],
            ['Değerlendirme ve yorumların yayınlanması, uygunsuz içeriğin denetlenmesi', 'Sözleşmenin ifası (c), meşru menfaat (f)'],
            ['Bilgi güvenliğinin sağlanması, dolandırıcılık ve kötüye kullanımın önlenmesi, erişim kayıtlarının tutulması', 'Hukuki yükümlülük (ç), meşru menfaat (f)'],
            ['Satış onayının kaydedilmesi ve saklanması; harcama itirazı, iade ve uyuşmazlık süreçlerinde ödeme kuruluşuna, bankalara ve yetkili kurumlara ispat amacıyla sunulması', 'Sözleşmenin kurulması ve ifası (c), hukuki yükümlülük (ç), bir hakkın tesisi, kullanılması veya korunması (e)'],
            ['Vergi, muhasebe ve ticari mevzuattan doğan kayıt ve saklama yükümlülükleri', 'Kanunlarda açıkça öngörülmesi (a), hukuki yükümlülük (ç)'],
            ['Uyuşmazlıklarda hakların tesisi, kullanılması ve korunması; yetkili makam taleplerinin karşılanması', 'Bir hakkın tesisi, kullanılması veya korunması (e), hukuki yükümlülük (ç)'],
          ],
        ),
        p('Yukarıdaki işlemler için açık rızanız aranmaz. İleride kampanya ve tanıtım amaçlı ticari elektronik ileti göndermek istersek, bunu ayrıca ve isteğe bağlı olarak onayınızı alarak yaparız; onay vermemeniz hizmetten yararlanmanızı etkilemez.'),
      ],
    },
    {
      title: '4. Kişisel verilerin aktarıldığı taraflar',
      blocks: [
        ul(
          'Randevu aldığınız işletme: ad soyad, telefon, e-posta, randevu ve not bilgileriniz, hizmetin sunulabilmesi ve sizinle iletişim kurulabilmesi için (sözleşmenin ifası).',
          `Lisanslı ödeme kuruluşu ${PAYMENT_PROVIDER.name}: kaporanın tahsili ve iadesi, ödeme ve sahtecilik önleme hizmetlerinin sunulması ve harcama itirazı (chargeback) süreçlerinin yürütülmesi için ad soyad, e-posta, telefon, ödeme anındaki IP adresi, profilinizdeki il/ilçe bilgisi ve sipariş bilgileri (sipariş numarası, tutar, işletme ve hizmet adı); harcama itirazı veya iade uyuşmazlığında ayrıca satış onayı kaydı ile randevu, iptal ve hizmet kayıtları. ${PAYMENT_PROVIDER.shortName} bu bilgileri harcama itirazı sürecinde kartı çıkaran bankaya ve iş ortağı bankalara iletebilir. Kart bilgileriniz ${COMPANY.brand}’ya uğramadan doğrudan ${PAYMENT_PROVIDER.shortName}’nin güvenli ödeme sayfasında işlenir (sözleşmenin kurulması ve ifası, hukuki yükümlülük, bir hakkın tesisi, kullanılması veya korunması).`,
          'Altyapı ve barındırma hizmet sağlayıcıları: veritabanı, kimlik doğrulama, şifre yenileme e-postalarının gönderimi ve dosya depolama hizmeti veren Supabase, Inc. ile web barındırma hizmeti veren Hostinger; verileriniz bu hizmetler aracılığıyla saklanır.',
          `WhatsApp destek hattı (WhatsApp, Meta Platforms): destek hattımıza (${WHATSAPP_SUPPORT.display}) yazdığınızda telefon numaranız, WhatsApp profil adınız ve mesaj içerikleriniz; destek verilmesi, kimlik doğrulaması ve telefon numarasıyla üye olan işletme sahiplerine geçici şifre iletilmesi amacıyla bu hizmet üzerinden işlenir. WhatsApp’ı kullanmak sizin tercihinizdir; uygulama içi destek merkezi de kullanılabilir.`,
          'Yapay zekâ destek hizmeti sağlayıcısı (OpenAI, L.L.C.): yalnızca destek merkezinde yapay zekâ asistanı etkin olduğunda, yazdığınız mesaj içerikleri ön yanıt üretmek amacıyla iletilir. Gönderimden önce e-posta adresleri, telefon, IBAN, kart, kimlik numarası ve rezervasyon kodu gibi bilgiler otomatik olarak maskelenir; ödeme, iade, şifre, şikâyet, KVKK ve sağlık gibi konular tespit edildiğinde mesajınız yapay zekâya gönderilmeden temsilciye aktarılır. Ad ve adres gibi bilgileri destek mesajlarınıza yazmamanızı rica ederiz.',
          'Görsel içerik sağlayıcısı (Pexels): bazı tanıtım görselleri bu sağlayıcının sunucularından yüklenir; bu sırada tarayıcınız IP adresinizi iletir.',
          'Harita uygulamaları: “Yol tarifi al” bağlantısına tıkladığınızda seçtiğiniz harita uygulamasına (Google Haritalar, Apple Haritalar, Yandex Haritalar) yalnızca işletmenin konumu iletilir.',
          'Yetkili kamu kurum ve kuruluşları ile hukuken yetkili özel kişiler: kanuni yükümlülükler kapsamında ve talep edilmesi halinde.',
        ),
      ],
    },
    {
      title: '5. Yurt dışına aktarım',
      blocks: [
        p('Altyapı (Supabase, Inc.), web barındırma (Hostinger) ve etkinleştirildiğinde yapay zekâ destek (OpenAI, L.L.C. – ABD) hizmet sağlayıcılarımızın sunucuları yurt dışında bulunmaktadır. Bu aktarımlar KVKK’nın 9. maddesi kapsamında, Kişisel Verileri Koruma Kurulu tarafından ilan edilen standart sözleşmelerin düzenlenmesi ve Kuruma bildirilmesi suretiyle gerçekleştirilir. Yapay zekâ destek hizmetine, yukarıda açıklandığı şekilde maskelenmiş destek mesajı içerikleri dışında veri iletilmez. WhatsApp destek hattına yazdığınızda mesajlarınız WhatsApp’ın (Meta Platforms) yurt dışındaki sunucularında da işlenir.'),
      ],
    },
    {
      title: '6. Toplama yöntemi',
      blocks: [
        p('Kişisel verileriniz; internet sitesi ve uygulamadaki üyelik, profil, randevu, ödeme, işletme kayıt ve destek formları aracılığıyla sizden, randevu aldığınız işletmeden ve ödeme kuruluşundan dönen işlem sonuçlarından, kısmen otomatik yollarla (oturum ve erişim kayıtları, tarayıcı depolama alanı) elektronik ortamda toplanır.'),
      ],
    },
    {
      title: '7. Saklama süresi',
      blocks: [
        ul(
          'Hesap ve profil bilgileri: üyeliğiniz devam ettiği sürece.',
          'Randevu, ödeme, iade, komisyon ve hak ediş kayıtları (tutar, tarih, durum): vergi ve ticari mevzuat gereği işlem tarihinden itibaren 10 yıl.',
          'Satış onayı kayıtları: ödeme kuruluşu sözleşmemiz ile vergi ve ticari mevzuat gereği işlem tarihinden itibaren 10 yıl.',
          'Randevu notları ve iptal açıklamaları gibi serbest metinler: randevudan itibaren 12 ay.',
          'Destek yazışmaları: talebin kapanmasından itibaren 2 yıl.',
          'Erişim ve işlem güvenliği kayıtları: altyapı ve barındırma sağlayıcılarımızın sistemlerinde, ilgili mevzuatta öngörülen süre boyunca.',
          'Hesabınızı sildiğinizde: favori, bildirim, konum ve profil bilgileriniz derhal silinir veya anonim hale getirilir; yasal saklama yükümlülüğü bulunan randevu ve ödeme kayıtları kimliğinizle ilişkilendirilmeden saklanır.',
        ),
        p('Süresi dolan veya işleme şartları ortadan kalkan veriler, Kişisel Verilerin Silinmesi, Yok Edilmesi veya Anonim Hale Getirilmesi Hakkında Yönetmelik uyarınca periyodik imha süreçlerinde (en geç 6 ayda bir) silinir veya anonim hale getirilir.'),
      ],
    },
    {
      title: '8. KVKK md. 11 kapsamındaki haklarınız',
      blocks: [
        p('Veri sorumlusuna başvurarak:'),
        ul(
          'Kişisel verilerinizin işlenip işlenmediğini öğrenme,',
          'İşlenmişse buna ilişkin bilgi talep etme,',
          'İşlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme,',
          'Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,',
          'Eksik veya yanlış işlenmişse düzeltilmesini isteme,',
          'KVKK md. 7’deki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,',
          'Düzeltme, silme ve yok etme işlemlerinin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,',
          'İşlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme,',
          'Kanuna aykırı işleme sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme haklarına sahipsiniz.',
        ),
        p(`Başvurunuzu “KVKK Başvuru” sayfasında açıklanan yöntemlerle (${writtenChannels}) iletebilirsiniz. Başvurular en geç 30 gün içinde ücretsiz olarak sonuçlandırılır. Profil sayfanızdaki “Verilerimi indir” seçeneğiyle hesabınıza ait verilerin bir kopyasını dilediğiniz an alabilirsiniz.`),
      ],
    },
  ],
};

const kosullar: LegalDocument = {
  slug: 'kullanim-kosullari',
  eyebrow: 'Sözleşme',
  title: 'Kullanım Koşulları ve Üyelik Sözleşmesi',
  summary: `${COMPANY.brand} platformunu kullanarak bu koşulları kabul etmiş olursunuz. Son güncelleme: ${LEGAL_UPDATED_AT}.`,
  sections: [
    {
      title: '1. Taraflar ve konu',
      blocks: [
        p(`Bu sözleşme, ${controller} ile platforma üye olan veya platformu kullanan kişi (“Kullanıcı”) arasındadır. Sözleşmenin konusu; müşterilerin kuaför, berber, güzellik, spa ve benzeri kişisel bakım hizmeti sunan işletmeleri keşfetmesi, randevu alması ve kapora ödemesi; işletmelerin ise hizmetlerini ve randevularını yönetmesi için sunulan platform hizmetidir.`),
        p(`${COMPANY.brand}, 6563 sayılı Kanun kapsamında aracı hizmet sağlayıcıdır. Randevu alınan hizmetin sunucusu ilgili işletmedir; hizmetin kalitesi, içeriği ve ifasından işletme sorumludur.`),
      ],
    },
    {
      title: '2. Üyelik',
      blocks: [
        ul(
          'Platformu 18 yaşından küçükler ancak veli veya vasisinin onayıyla kullanabilir.',
          'Kayıt sırasında verdiğiniz bilgilerin doğru ve güncel olması sizin sorumluluğunuzdadır.',
          'Hesap şifrenizin gizliliğini korumak sizin sorumluluğunuzdadır; yetkisiz kullanımı fark ederseniz derhal bize bildirin.',
          `İşletme sahipleri e-posta adresi yerine cep telefonu numarasıyla da üye olabilir. Bu durumda telefon numaranız giriş bilgisi olarak kullanılır; hesabınıza e-posta gönderilmez ve şifre yenileme bağlantısı e-postayla iletilemez. Şifrenizi unutursanız, hesabınızda kayıtlı telefon numarasından WhatsApp destek hattımıza (${WHATSAPP_SUPPORT.display}) yazarak kimliğiniz doğrulandıktan sonra yardım isteyebilirsiniz.`,
          'İşletme hesapları, yayına alınmadan önce tarafımızca incelenir; eksik veya yanıltıcı bilgi içeren işletmeler yayına alınmayabilir veya askıya alınabilir.',
        ),
      ],
    },
    {
      title: '3. Randevu ve kapora',
      blocks: [
        ul(
          'Randevu, işletmenin belirlediği hizmet, süre, fiyat ve çalışan müsaitliği üzerinden oluşturulur. Fiyatlar ve kapora tutarı ödeme öncesinde açıkça gösterilir.',
          'Aynı gün için alınan randevular ile anında onay kullanmayan işletmelerin tüm randevuları işletmenin onayına tabidir; işletme onaylayana kadar randevu kesinleşmez.',
          'Kapora, lisanslı ödeme kuruluşu PayTR Ödeme ve Elektronik Para Kuruluşu A.Ş. aracılığıyla, PayTR’nin güvenli ödeme sayfasında tahsil edilir; kalan tutar hizmet sonrasında doğrudan işletmeye ödenir. Platform test modunda çalıştığı sürece kartınızdan herhangi bir tutar çekilmez ve hizmet bedelinin tamamı işletmede ödenir; ödeme ekranında bu durum açıkça belirtilir.',
          'Kapora ödemeli randevularda ayrıca “Mesafeli Hizmet Satış Sözleşmesi” uygulanır; ödeme, ödeme ekranında satış onayı verilmeden başlatılmaz.',
          'Örnek işletme olarak işaretlenen işletmeler tanıtım amaçlıdır ve randevu kabul etmez.',
          'İptal, erteleme ve iade şartları “İptal ve İade Koşulları” sayfasında ve işletmenin randevu ekranında gösterilen iptal süresinde düzenlenmiştir.',
        ),
      ],
    },
    {
      title: '4. Kullanıcı yükümlülükleri',
      blocks: [
        ul(
          'Platformu hukuka, genel ahlaka ve bu koşullara uygun şekilde kullanmak.',
          'Gerçek olmayan randevu oluşturmamak, başkası adına izinsiz işlem yapmamak.',
          'Yorum ve değerlendirmelerde yalnızca gerçekten aldığınız hizmete ilişkin, hakaret, kişisel veri, reklam ve hukuka aykırı içerik barındırmayan ifadeler kullanmak.',
          'Platformun güvenliğini tehlikeye atacak, otomatik veri toplama (scraping), tersine mühendislik veya aşırı yük oluşturacak girişimlerde bulunmamak.',
          'İşletmeler; sunduğu hizmet, fiyat, çalışma saati ve iptal politikası bilgilerinin doğruluğundan ve müşterilerinin kişisel verilerini yalnızca randevu hizmeti için, KVKK’ya uygun şekilde kullanmaktan sorumludur.',
        ),
      ],
    },
    {
      title: '5. İşletmelere ilişkin ek hükümler',
      blocks: [
        ul(
          'İşletme, platform aracılığıyla edindiği müşteri verileri bakımından KVKK uyarınca bağımsız veri sorumlusudur; bu verileri yalnızca randevu ve hizmet ilişkisi için kullanır, pazarlama amacıyla kullanmaz ve üçüncü kişilerle paylaşmaz.',
          'İşletme, platformda yayınladığı çalışan ad, unvan, biyografi ve fotoğrafları için çalışanlarını aydınlatmak ve gerekli açık rızaları almakla yükümlüdür; ayrılan çalışanların bilgilerini platformdan kaldırır.',
          'İşletme hesabına erişen kişilerin hesap güvenliğinden ve IBAN bilgilerinin doğruluğundan işletme sorumludur.',
          'Komisyon oranı ve hak ediş koşulları işletme panelinde gösterilir; değişiklikler yürürlüğe girmeden önce bildirilir.',
          'İşletme, platformda yayınladığı hizmet fiyatlarının tüm vergiler dahil son satış fiyatı olduğunu ve müşteriden bu fiyat dışında ek bedel talep etmeyeceğini kabul eder.',
        ),
      ],
    },
    {
      title: '6. İçerik ve fikri mülkiyet',
      blocks: [
        p(`Platformun tasarımı, yazılımı, ${COMPANY.brand} markası ve logosu Şirket’e aittir. İşletmelerin yüklediği görsel ve metinlerin hukuka uygunluğundan ilgili işletme sorumludur. Hukuka aykırı olduğu bildirilen içerikler 5651 sayılı Kanun ve ilgili mevzuat çerçevesinde kaldırılabilir.`),
      ],
    },
    {
      title: '7. Hizmetin askıya alınması ve fesih',
      blocks: [
        p('Bu koşulların ihlali, dolandırıcılık şüphesi veya mevzuattan doğan zorunluluk hallerinde hesabınızı geçici olarak askıya alabilir veya kapatabiliriz. Hesabınızı dilediğiniz zaman kapatabilirsiniz; yasal saklama yükümlülüğü bulunan kayıtlar, ilgili süre boyunca saklanmaya devam eder.'),
      ],
    },
    {
      title: '8. Sorumluluğun sınırı',
      blocks: [
        p('Platformun kesintisiz ve hatasız çalışması için makul tüm teknik önlemleri alırız. Hizmetin işletme tarafından sunulmasından doğan uyuşmazlıklarda öncelikle ilgili işletme sorumludur; bu tür durumlarda destek merkezimiz aracılığıyla çözüm sürecine yardımcı oluruz. Tüketicilerin kanundan doğan hakları saklıdır.'),
      ],
    },
    {
      title: '9. Değişiklikler, bildirimler ve uyuşmazlıklar',
      blocks: [
        p('Bu koşullarda yapılacak esaslı değişiklikler yürürlüğe girmeden önce platformda duyurulur. Bildirimler uygulama içi bildirim olarak ve hesabınızda e-posta adresi kayıtlıysa bu adrese yapılır. E-posta adresi olmadan telefon numarasıyla üye olan işletme sahiplerine bildirimler uygulama içinde iletilir.'),
        p(`Bu sözleşme Türk hukukuna tabidir. Tüketici işlemlerinden doğan uyuşmazlıklarda ${TUKETICI_UYUSMAZLIK}`),
      ],
    },
  ],
};

const cerez: LegalDocument = {
  slug: 'cerez-politikasi',
  eyebrow: 'Gizlilik',
  title: 'Çerez Politikası',
  summary: `${COMPANY.brand}, reklam veya analitik amaçlı çerez kullanmaz. Tarayıcınızın yerel depolama alanını yalnızca sitenin çalışması ve sizin seçtiğiniz tercihlerin hatırlanması için kullanırız. Sürüm: ${LEGAL_VERSIONS.cookies}.`,
  sections: [
    {
      title: '1. Kullandığımız depolama kayıtları',
      blocks: [
        table(
          ['Kayıt', 'Amaç', 'Tür', 'Süre'],
          [
            ['sb-…-auth-token', 'Oturumunuzun açık kalması ve güvenli kimlik doğrulama', 'Zorunlu', 'Çıkış yapana veya oturum süresi dolana kadar'],
            ['rango-theme', 'Koyu temayı seçtiyseniz bu tercihin hatırlanması (seçim yapmazsanız kayıt oluşmaz)', 'İşlevsel (tercih)', 'Siz silene kadar'],
            ['veyra.location', 'Seçtiğiniz semt/konum; yakınınızdaki işletmeleri göstermek için', 'İşlevsel (tercih)', 'Siz değiştirene veya silene kadar'],
            ['veyra.onboarded', 'Tanıtım ekranlarının tekrar gösterilmemesi', 'İşlevsel', 'Siz silene kadar'],
            ['rango.slogan', 'Her ziyarette farklı bir slogan gösterilmesi (kişisel veri içermez)', 'İşlevsel', 'Siz silene kadar'],
            ['rango.cookie-notice', 'Bu bilgilendirmeyi kapattığınızın hatırlanması', 'Zorunlu', 'Siz silene kadar'],
          ],
        ),
        p('Bu kayıtlar yalnızca sizin tarayıcınızda tutulur; konum bilginiz giriş yaptıysanız profilinize yaklaşık (yaklaşık 1 km) hassasiyetle kaydedilir. Zorunlu ve sizin talep ettiğiniz tercihleri hatırlayan işlevsel kayıtlar için KVKK Çerez Uygulamaları Hakkında Rehber uyarınca açık rıza aranmaz.'),
      ],
    },
    {
      title: '2. Üçüncü taraf içerikler',
      blocks: [
        p('Bazı tanıtım görselleri Pexels sunucularından yüklenir. Bu sağlayıcı, görseli iletirken tarayıcınızın IP adresini görebilir; ancak tarafımızca bu sağlayıcıya çerez yerleştirme izni verilmemiştir. Yazı tipleri kendi sunucumuzdan yüklenir.'),
        p('Kapora ödemesi sırasında ödeme sayfası lisanslı ödeme kuruluşu PayTR (www.paytr.com) tarafından, sitemizin içinde bir çerçevede veya uygulama içi tarayıcıda gösterilir. Bu sayfa, ödemenin güvenliği ve dolandırıcılığın önlenmesi için PayTR ve altyapı sağlayıcılarının kendi çerez ve benzeri teknolojilerini kullanabilir; bu kayıtlar PayTR’nin kendi politikalarına tabidir ve Rango tarafından okunmaz.'),
      ],
    },
    {
      title: '3. Tercihlerinizi yönetme',
      blocks: [
        p('Tarayıcınızın ayarlarından site verilerini dilediğiniz zaman silebilirsiniz. Zorunlu kayıtları silmeniz halinde oturumunuz kapanır; işlevsel kayıtları silmeniz halinde tema ve konum tercihleriniz varsayılan değerlere döner.'),
      ],
    },
  ],
};

const satis: LegalDocument = {
  slug: 'satis-sozlesmesi',
  eyebrow: 'Sözleşme',
  title: 'Mesafeli Hizmet Satış Sözleşmesi ve Satış Onayı',
  summary: `Kapora ödemeli randevularda müşteri, hizmet sağlayıcı işletme ve ${COMPANY.brand} arasındaki satış koşulları; ödeme ekranındaki satış onayıyla kabul edilir. Sürüm: ${LEGAL_VERSIONS.sale}.`,
  sections: [
    {
      title: '1. Taraflar',
      blocks: [
        ul(
          'Hizmet Sağlayıcı: Ödeme ekranındaki ön bilgilendirmede adı ve adresi gösterilen, randevu alınan hizmeti sunan işletme.',
          `Aracı Hizmet Sağlayıcı: ${controller}. ${COMPANY.brand}, 6563 sayılı Kanun kapsamında aracı hizmet sağlayıcıdır; randevu ve kapora tahsilatına aracılık eder. Adres: ${COMPANY.address}, e-posta: ${COMPANY.email}.`,
          'Alıcı: Platform üzerinden randevu oluşturan ve kaporayı ödeyen kullanıcı (“Müşteri”).',
          `Ödeme Kuruluşu: Ödemeler, 6493 sayılı Kanun kapsamında lisanslı ${PAYMENT_PROVIDER.name} (“${PAYMENT_PROVIDER.shortName}”) altyapısıyla alınır. ${PAYMENT_PROVIDER.shortName} bu sözleşmenin tarafı değildir; yalnızca ödeme hizmeti sağlar.`,
        ),
      ],
    },
    {
      title: '2. Sözleşmenin konusu',
      blocks: [
        p('Bu sözleşmenin konusu, Müşteri’nin platform üzerinden seçtiği hizmet için belirlenen tarih ve saatte randevu ayrılması ve bunun karşılığında kapora ödenmesidir. Hizmetin kendisi Hizmet Sağlayıcı tarafından, işletme adresinde sunulur; hizmetin kalitesi, içeriği, ifası ve yasal belgelerinin (fatura vb.) düzenlenmesinden Hizmet Sağlayıcı sorumludur.'),
      ],
    },
    {
      title: '3. Hizmet, bedel ve kapora',
      blocks: [
        ul(
          'Hizmetin adı, süresi, uzmanı, tarihi ve saati, toplam hizmet bedeli, kapora tutarı, işletmede ödenecek kalan tutar, işletme onayı ve ücretsiz iptal koşulları ile cayma hakkı, ödeme öncesinde ön bilgilendirmede gösterilir ve bu sözleşmenin ayrılmaz parçasıdır.',
          'Tüm tutarlar Türk Lirası (₺) cinsindendir ve vergiler dahildir.',
          `Kapora, Hizmet Sağlayıcı adına ve hesabına ${COMPANY.brand} aracılığıyla ${PAYMENT_PROVIDER.shortName} üzerinden tahsil edilir ve hizmet bedelinden düşülür. Kalan tutar hizmetten sonra doğrudan işletmeye ödenir.`,
          'Aynı gün randevularında ve anında onay kullanmayan işletmelerin randevularında randevu, Hizmet Sağlayıcı’nın onayıyla kesinleşir; bu durum ön bilgilendirmede ayrıca belirtilir. Hizmet Sağlayıcı talebi reddederse veya randevu saatine kadar onaylamazsa sözleşme kendiliğinden sona erer ve ödenen kapora tamamen iade edilir.',
          'Platform test modunda çalıştığı sürece karttan herhangi bir tutar çekilmez ve hizmet bedelinin tamamı işletmede ödenir; ödeme ekranında bu durum açıkça belirtilir. Ödeme ekranında “PayTR test modu” uyarısı görünen işlemlerde de karttan gerçek tahsilat yapılmaz.',
        ),
      ],
    },
    {
      title: '4. Ödeme ve kart bilgilerinin güvenliği',
      blocks: [
        ul(
          `Kart ile ödeme, ${PAYTR_PAGE} gerçekleştirilir. Kart numarası, son kullanma tarihi, CVV/CVC ve 3D Secure şifresi gibi bilgiler ${COMPANY.brand} veya Hizmet Sağlayıcı tarafından görülmez, işlenmez ve saklanmaz.`,
          `${COMPANY.brand} yalnızca ödeme sonucunu, ${PAYMENT_PROVIDER.shortName} işlem numarasını, kart markasını ve kartın son 4 hanesini kaydeder.`,
          'Ödeme, kartı çıkaran bankanın 3D Secure doğrulaması ve onayıyla tamamlanır. Banka veya ödeme kuruluşunca onaylanmayan işlemlerde randevu kesinleşmez ve ayrılan saat süre sonunda serbest kalır.',
          'Kartın yetkisiz kullanımı halinde Müşteri, kartı çıkaran bankaya başvurma hakkına sahiptir.',
        ),
      ],
    },
    {
      title: '5. Sözleşmenin kurulması ve satış onayı',
      blocks: [
        p(`Sözleşme elektronik ortamda şu adımlarla kurulur: (1) İşletme sayfasında hizmet, uzman, tarih ve saat seçilir. (2) Özet ekranında seçimler ve tutarlar gösterilir; ödeme adımına geçildiğinde seçilen saat, ödeme süresi boyunca Müşteri için ayrılır. (3) Ödeme ekranında ön bilgilendirme ve bu sözleşme okunur, satış onayı kutusu işaretlenir. (4) Kapora ${PAYTR_PAGE} ödenir; platform test modundayken test ödemesi tamamlanır.`),
        p('Giriş hatalarının düzeltilmesi: Ödemeden önce bir hata fark edilirse özet ekranında geri dönülerek seçim değiştirilebilir. Ödeme ekranına geçildikten sonra, ödeme bekleyen randevu ödeme ekranındaki “Ayrılan saati serbest bırak” düğmesiyle veya Randevularım sayfasından ücretsiz iptal edilerek yeniden randevu oluşturulabilir. Ödeme süresi içinde tamamlanmayan randevu kendiliğinden iptal olur ve herhangi bir tutar tahsil edilmez.'),
        p('Müşteri, ödeme ekranında aşağıdaki satış onayını işaretleyerek bu sözleşmeyi elektronik ortamda kabul eder:'),
        p(`“${SALE_CONSENT_TEXT}”`),
        p(`Platform test modundayken (ödeme kuruluşuna işlem gönderilmez, karttan tahsilat yapılmaz) ödeme ekranında bunun yerine şu onay metni gösterilir: “${SALE_CONSENT_TEXT_TEST}”`),
        p(`Satış onayı; onay tarihi ve saati, kabul edilen sözleşme sürümü ve dili, işletme, hizmet, uzman, randevu tarihi ve tutar bilgileriyle birlikte ${COMPANY.brand} sistemlerinde kaydedilir ve işlem tarihinden itibaren 10 yıl saklanır. Onay kaydı olmadan ödeme başlatılmaz. Bu kayıt; harcama itirazı, iade talebi veya yetkili kurumların talebi halinde ${PAYMENT_PROVIDER.shortName}’ye, ilgili bankaya veya yetkili kurumlara sunulabilir.`),
      ],
    },
    {
      title: '6. İptal ve iade',
      blocks: [
        ul(
          'Randevunun iptali, ertelenmesi ve kapora iadesi “İptal ve İade Koşulları” sayfasında ve ön bilgilendirmede gösterilen ücretsiz iptal süresine göre yapılır; cayma hakkına ilişkin 7. madde saklıdır.',
          `İadeler, ödemede kullanılan karta ${PAYMENT_PROVIDER.shortName} aracılığıyla yapılır; tutarın kart hesabına yansıma süresi bankaya bağlıdır (genellikle 2–10 iş günü). Nakit iade yapılmaz.`,
          'Hizmet Sağlayıcı’nın randevuyu reddetmesi, onaylamadan zaman aşımına uğraması veya iptal etmesi halinde kapora tamamen iade edilir.',
          `Hizmete ilişkin talep ve şikâyetler Hizmet Sağlayıcı’ya veya ${COMPANY.brand} destek merkezine (Destek sayfası) ve ${COMPANY.email} adresine iletilebilir.`,
        ),
      ],
    },
    {
      title: '7. Cayma hakkı',
      blocks: [ul(...CAYMA_HAKKI)],
    },
    {
      title: '8. Harcama itirazı',
      blocks: [
        p(`Müşteri, kartı çıkaran bankaya harcama itirazında bulunma hakkına sahiptir. İtiraz halinde ${COMPANY.brand} ve Hizmet Sağlayıcı; satış onayı kaydını, randevu, iptal ve hizmet kayıtlarını ${PAYMENT_PROVIDER.shortName} ve bankaya sunabilir. İtiraz sonuçlanana kadar ilgili tutar ödeme kuruluşu tarafından bloke edilebilir. Gerçek dışı işlem veya kartın başkası tarafından izinsiz kullanımı şüphesinde işlem durdurulabilir ve yetkili mercilere bildirilebilir.`),
      ],
    },
    {
      title: '9. Kişisel veriler',
      blocks: [
        p(`Ödemenin alınması, sahtecilik önleme ve harcama itirazı süreçleri için gereken işlem bilgileri (ad soyad, e-posta, telefon, ödeme anındaki IP adresi, profildeki il/ilçe bilgisi, işletme ve hizmet adı, tutar ve sipariş numarası) ${PAYMENT_PROVIDER.shortName} ile paylaşılır. Ayrıntılar KVKK Aydınlatma Metni’nde yer alır.`),
      ],
    },
    {
      title: '10. Yürürlük, sözleşme örneği ve uyuşmazlıklar',
      blocks: [
        p('Bu sözleşme, Müşteri’nin ödeme ekranında satış onayını vermesiyle kurulur ve kaporanın ödenmesiyle (platform test modundayken test ödemesinin tamamlanmasıyla) yürürlüğe girer. Kapora ödeme süresi içinde ödenmezse sözleşme kendiliğinden sona erer.'),
        p(`Bu sayfada sözleşmenin güncel sürümü yer alır. Onayladığınız sürüm satış onayı kaydınızla birlikte saklanır; bu sürümün bir örneğini destek merkezimizden veya ${COMPANY.email} adresinden isteyebilirsiniz. Randevu bilgileriniz Randevularım sayfasında yer alır.`),
        p(`Bu sözleşme Türk hukukuna tabidir. Uyuşmazlıklarda ${TUKETICI_UYUSMAZLIK}`),
      ],
    },
  ],
};

const iade: LegalDocument = {
  slug: 'iptal-iade',
  eyebrow: 'Ödeme',
  title: 'İptal, Erteleme ve İade Koşulları',
  summary: `Kapora ödemeli randevularda iptal, erteleme, cayma ve iade kuralları. Ödeme ekranındaki satış onayıyla, Mesafeli Hizmet Satış Sözleşmesi ile birlikte kabul edilir (sürüm: ${LEGAL_VERSIONS.sale}).`,
  sections: [
    {
      title: '1. Ödeme öncesi bilgilendirme',
      blocks: [
        p('Randevunuzu onaylamadan önce; işletmenin adı ve adresi, hizmetin adı, süresi ve toplam fiyatı, kapora tutarı, işletmede ödenecek tutar, işletme onayı gerekip gerekmediği, işletmenin ücretsiz iptal süresi ve cayma hakkınız ödeme ekranında gösterilir.'),
        p('Kapora, lisanslı ödeme kuruluşu PayTR aracılığıyla tahsil edilir. Platform test modunda çalıştığı sürece ödeme ekranındaki işlem bir test ödemesidir: kartınızdan herhangi bir tutar çekilmez ve hizmet bedelinin tamamı işletmede ödenir; ödeme ekranında bu durum açıkça belirtilir.'),
      ],
    },
    {
      title: '2. Müşteri tarafından iptal ve erteleme',
      blocks: [
        ul(
          'İşletmenin randevu sayfasında belirtilen iptal süresinden (ör. randevudan 24 saat önce) daha önce yaptığınız iptallerde kapora tutarı tamamen iade edilir.',
          'Henüz işletme onayı bekleyen bir randevuyu iptal ettiğinizde, iptal süresi geçmiş olsa bile kapora tamamen iade edilir. Ancak randevuyu daha önce ertelediyseniz, onay bekleyen bu randevuyu iptal süresi geçtikten sonra iptal etmeniz halinde kapora iade edilmez (cayma hakkınız saklıdır). İşletme böyle bir randevuyu başlangıç saatine kadar onaylamazsa randevu iptal edilir ve kapora tamamen iade edilir.',
          'Cayma süresi sona ermiş onaylı bir randevuyu iptal süresi geçtikten sonra iptal etmeniz veya bildirimde bulunmadan randevuya gelmemeniz halinde kapora, işletmenin ayırdığı zamanın karşılığı olarak iade edilmez.',
          'Ödemesi tamamlanmamış randevuları iptal ettiğinizde herhangi bir tahsilat yapılmaz.',
          'Randevunuzu, işletmenin iptal süresi içinde ve platform ayarlarında belirtilen erteleme hakkı sayısı kadar, uygun başka bir saate erteleyebilirsiniz.',
        ),
      ],
    },
    {
      title: '3. Cayma hakkı',
      blocks: [ul(...CAYMA_HAKKI)],
    },
    {
      title: '4. İşletme tarafından ret veya iptal',
      blocks: [
        p('Onay gerektiren randevu talebinizin (aynı gün randevuları ve anında onay kullanmayan işletmelerin randevuları) işletme tarafından reddedilmesi, onaylanmadan zaman aşımına uğraması veya randevunun işletme tarafından iptal edilmesi halinde kapora tutarı tamamen iade edilir.'),
      ],
    },
    {
      title: '5. İade süreci',
      blocks: [
        p('Test modunda yapılan ödemelerde karttan tahsilat yapılmadığından iade işlemi de gerekmez. Kartla ödenen kaporaların iadesi, ödemede kullandığınız karta PayTR aracılığıyla yapılır. İade talebiniz onaylandıktan sonra tutarın hesabınıza yansıması bankanıza bağlı olarak genellikle 2–10 iş günü sürer. Uyuşmazlık halinde destek merkezimizden talep oluşturabilirsiniz.'),
        p('Cayma hakkı kapsamındaki iadeler, cayma bildiriminin ulaştığı tarihten itibaren en geç 14 gün içinde yapılır. Bu koşullar, tüketici mevzuatından doğan haklarınızı sınırlamaz.'),
      ],
    },
  ],
};

const basvuru: LegalDocument = {
  slug: 'kvkk-basvuru',
  eyebrow: 'KVKK',
  title: 'İlgili Kişi Başvurusu',
  summary: 'KVKK md. 11 kapsamındaki haklarınızı kullanmak için başvuru yöntemleri.',
  sections: [
    {
      title: '1. Başvuru yöntemleri',
      blocks: [
        p('Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ uyarınca başvurunuzu aşağıdaki yöntemlerden biriyle iletebilirsiniz:'),
        ul(
          ...[
            `Islak imzalı dilekçe ile şahsen veya noter aracılığıyla: ${COMPANY.address}`,
            filled(COMPANY.kep) ? `Kayıtlı Elektronik Posta (KEP) ile: ${COMPANY.kep}` : '',
            `Güvenli elektronik imza veya mobil imza ile imzalanmış e-posta ya da sistemimizde kayıtlı e-posta adresinizden: ${COMPANY.kvkkEmail}`,
            'Uygulamaya giriş yaparak Destek merkezinden “KVKK başvurusu” konulu bir talep açarak (e-posta adresi olmadan telefon numarasıyla üye olanlar için de geçerlidir).',
          ].filter(Boolean),
        ),
      ],
    },
    {
      title: '2. Başvuruda bulunması gerekenler',
      blocks: [
        ul(
          'Ad, soyad ve başvuru yazılı ise imza,',
          'Türkiye Cumhuriyeti vatandaşları için T.C. kimlik numarası, yabancılar için uyruk ve pasaport/kimlik numarası,',
          'Tebligata esas yerleşim yeri veya iş yeri adresi,',
          'Varsa bildirime esas e-posta adresi, telefon numarası,',
          'Talep konusu ve talebinize ilişkin bilgi ve belgeler.',
        ),
        p('Kimliğinizi doğrulayabilmemiz için başvurunuzu, hesabınızda kayıtlı e-posta adresinden göndermenizi öneririz. E-posta adresi olmadan telefon numarasıyla üye olduysanız başvurunuzda hesabınıza kayıtlı telefon numarasını belirtin veya başvurunuzu uygulamadaki Destek merkezinden iletin.'),
      ],
    },
    {
      title: '3. Yanıt süresi',
      blocks: [
        p('Başvurunuz, talebin niteliğine göre en kısa sürede ve en geç 30 gün içinde ücretsiz olarak sonuçlandırılır. İşlemin ayrıca bir maliyet gerektirmesi halinde Kişisel Verileri Koruma Kurulunca belirlenen tarifedeki ücret alınabilir. Başvurunuzun reddedilmesi, verilen cevabı yetersiz bulmanız veya süresinde cevap verilmemesi halinde Kişisel Verileri Koruma Kuruluna şikâyette bulunabilirsiniz.'),
      ],
    },
  ],
};

const kunye: LegalDocument = {
  slug: 'kunye',
  eyebrow: 'Künye',
  title: 'Künye ve İletişim',
  summary: '6563 sayılı Elektronik Ticaretin Düzenlenmesi Hakkında Kanun md. 3 kapsamında hizmet sağlayıcı bilgileri.',
  sections: [
    {
      title: 'Hizmet sağlayıcı',
      blocks: [
        table(
          ['Bilgi', 'Değer'],
          (
            [
              ['Unvan', COMPANY.legalName],
              ['Marka', COMPANY.brand],
              ['Vergi kimlik no', COMPANY.taxNumber],
              ['MERSİS no', COMPANY.mersis],
              ['Vergi dairesi', COMPANY.taxOffice],
              ['Ticaret sicili', COMPANY.tradeRegistry],
              ['Adres', COMPANY.address],
              ['E-posta', COMPANY.email],
              ['KVKK başvuru e-postası', COMPANY.email === COMPANY.kvkkEmail ? '' : COMPANY.kvkkEmail],
              ['KEP', COMPANY.kep],
              ['Telefon', COMPANY.phone],
              ['VERBİS kayıt no', COMPANY.verbis],
              ['Web sitesi', COMPANY.website],
            ] as [string, string][]
          ).filter(([, value]) => filled(value)),
        ),
      ],
    },
  ],
};

const hesapSilme: LegalDocument = {
  slug: 'hesap-silme',
  eyebrow: 'Hesap',
  title: `${COMPANY.brand} Hesabınızı Silme`,
  summary: `${COMPANY.brand} uygulamasındaki (Android, iOS ve ${COMPANY.website.replace('https://', '')}) hesabınızı nasıl silebileceğinizi, hangi verilerin silindiğini ve hangilerinin ne kadar süre saklandığını açıklar. Geliştirici: ${COMPANY.legalName}.`,
  sections: [
    {
      title: '1. Uygulamadan silme',
      blocks: [
        ul(
          `${COMPANY.brand} uygulamasını açın veya ${COMPANY.website.replace('https://', '')} adresine gidin ve hesabınıza giriş yapın.`,
          'Alttaki menüden “Profil” sayfasına girin.',
          '“Verilerim ve gizlilik” bölümündeki “Hesabımı sil” düğmesine dokunun.',
          'Açılan pencerede onay kutusunu işaretleyip “Hesabımı kalıcı olarak sil” düğmesine dokunun.',
        ),
        p('Müşteri hesapları anında silinir. İşletme hesaplarında bekleyen ödeme ve hak edişler bulunabileceğinden, işletme sahipleri silme talebini işletme panelindeki “Yardım ve Destek” bölümünden veya 2. maddedeki yöntemlerle iletir; talep en geç 30 gün içinde sonuçlandırılır. Yaklaşan veya ödeme/onay bekleyen randevunuz ya da sonuçlanmamış bir iade talebiniz varsa, hesabınızı silmeden önce bunların iptal edilmesi veya tamamlanması gerekir.'),
      ],
    },
    {
      title: '2. Uygulamaya erişmeden silme talebi',
      blocks: [
        p(`Uygulamaya erişemiyorsanız, hesabınızda kayıtlı e-posta adresinizden ${COMPANY.kvkkEmail} adresine “Hesap silme talebi” konulu bir e-posta gönderin. E-postada hesabınızda kayıtlı e-posta adresini belirtin. E-posta adresi olmadan telefon numarasıyla üye olduysanız, talebinizi hesabınızda kayıtlı telefon numarasından WhatsApp destek hattımıza (${WHATSAPP_SUPPORT.display}) “Hesap silme talebi” yazarak iletin. Kimliğinizi doğruladıktan sonra hesabınız silinir ve talebiniz en geç 30 gün içinde ücretsiz olarak sonuçlandırılır.`),
      ],
    },
    {
      title: '3. Silinen veriler',
      blocks: [
        ul(
          'Ad, soyad, e-posta adresi, telefon numarası ve profil bilgileri,',
          'Konum ve semt tercihleri,',
          'Favoriler ve bildirimler,',
          'Oturum ve giriş bilgileri (hesaba bir daha giriş yapılamaz).',
        ),
        p('Yazdığınız yorumlar “Silinmiş kullanıcı” adıyla, kimliğinizle ilişkilendirilmeden kalır.'),
      ],
    },
    {
      title: '4. Saklanan veriler ve süreleri',
      blocks: [
        p('Aşağıdaki kayıtlar yasal yükümlülükler nedeniyle, kimliğinizle ilişkilendirilmeden (anonim hale getirilerek) belirtilen süre boyunca saklanır ve süre sonunda silinir:'),
        table(
          ['Kayıt', 'Saklama süresi', 'Neden'],
          [
            ['Randevu, ödeme, iade, komisyon ve satış onayı kayıtları', 'İşlem tarihinden itibaren 10 yıl', 'Vergi ve ticari mevzuat, ödeme kuruluşu sözleşmesi'],
            ['Randevu notları ve iptal açıklamaları', 'Randevudan itibaren 12 ay', 'Uyuşmazlıkların çözümü'],
            ['Destek yazışmaları', 'Talebin kapanmasından itibaren 2 yıl', 'Şikâyet ve uyuşmazlıkların çözümü'],
          ],
        ),
        p(`Ayrıntılar için KVKK Aydınlatma Metni’ne bakabilirsiniz. Sorularınız için: ${COMPANY.kvkkEmail}.`),
      ],
    },
    {
      title: 'English summary',
      blocks: [
        p(`To delete your ${COMPANY.brand} account (developer: ${COMPANY.legalName}): open the ${COMPANY.brand} app or ${COMPANY.website.replace('https://', '')}, sign in, go to Profile → “My data & privacy” → “Delete my account” and confirm. Customer accounts are deleted immediately. Business owners request deletion through “Help & Support” in the business panel or by email or WhatsApp (below); it is completed within 30 days. If you cannot access the app, email ${COMPANY.kvkkEmail} from your account’s email address with the subject “Account deletion request”. If you signed up with a phone number and no email, send “Account deletion request” to our WhatsApp support line (${WHATSAPP_SUPPORT.display}) from that phone number instead. It will be completed within 30 days.`),
        p('Deleted: name, email, phone, profile, location preferences, favourites, notifications and sign-in access. Reviews remain anonymously as “Deleted user”. Kept without being linked to your identity: booking, payment, refund and purchase-confirmation records for 10 years (tax and commercial law), booking notes for 12 months and support messages for 2 years.'),
      ],
    },
  ],
};

export const LEGAL_DOCUMENTS: Record<LegalSlug, LegalDocument> = {
  'aydinlatma-metni': aydinlatma,
  'kullanim-kosullari': kosullar,
  'cerez-politikasi': cerez,
  'satis-sozlesmesi': satis,
  'iptal-iade': iade,
  'kvkk-basvuru': basvuru,
  'hesap-silme': hesapSilme,
  kunye,
};
