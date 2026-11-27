/**
 * Birden çok içerik sayfasında tekrar eden bloklar: "nasıl çalışır", randevuyla ilgili sık
 * sorulan sorular ve işletme sahiplerine çağrı.
 *
 * METİN KURALI: Buradaki ve `pages/` altındaki her cümle uygulamanın gerçek davranışını ya da
 * yasal metinleri (src/pages/legal/legalContent.ts) anlatır. Sayı, üstünlük ("en iyi"),
 * garanti, sabit oran veya süre gibi doğrulanamayan iddialar yazılmaz. Bir kural değişirse
 * (kapora, iptal, komisyon, ödeme) ilgili cümle de güncellenmelidir.
 */
import type { Block, BlockLink, FaqItem } from '../blocks';
import type { SeoLang } from '../meta';
import { locativeTr } from '../places';
import { PAYMENTS_IN_TEST_MODE } from '../config';

const pick = (lang: SeoLang, tr: string, en: string) => (lang === 'en' ? en : tr);

export const FOR_BUSINESS_PATH = '/isletmeler-icin';
export const FAQ_PATH = '/sss';
export const BUSINESS_SIGNUP_PATH = '/kayit?tip=isletme';
export const CANCELLATION_POLICY_PATH = '/yasal/iptal-iade';

/** The site-wide links shown in the footer of every customer page (and of the static pages). */
export function siteLinks(lang: SeoLang): BlockLink[] {
  return [
    { label: pick(lang, 'İzmir’de randevu', 'Book in İzmir'), path: '/izmir' },
    { label: pick(lang, 'Kategoriler', 'Categories'), path: '/kategoriler' },
    { label: pick(lang, 'İşletmeler için', 'For businesses'), path: FOR_BUSINESS_PATH },
    { label: pick(lang, 'Sık sorulan sorular', 'FAQ'), path: FAQ_PATH },
  ];
}

export function howItWorksBlock(lang: SeoLang): Block {
  return {
    kind: 'steps',
    title: pick(lang, 'Rango ile randevu nasıl alınır?', 'How booking with Rango works'),
    items: [
      {
        title: pick(lang, 'Bir işletme seçin', 'Choose a business'),
        text: pick(
          lang,
          'İşletmeleri kategoriye, semte ve fiyata göre karşılaştırın; hizmetleri, fiyatları, çalışma saatlerini ve değerlendirmeleri inceleyin.',
          'Compare businesses by category, area and price; check their services, prices, opening hours and reviews.',
        ),
      },
      {
        title: pick(lang, 'Hizmeti ve saati belirleyin', 'Pick a service and time'),
        text: pick(
          lang,
          'Hizmeti, uzmanı ve size uyan saati seçin. Yalnızca gerçekten boş olan saatler gösterilir.',
          'Choose the service, the specialist and a time that suits you. Only times that are really free are shown.',
        ),
      },
      {
        title: pick(lang, 'Randevunuzu onaylayın', 'Confirm your booking'),
        text: pick(
          lang,
          'Özeti kontrol edip randevunuzu onaylayın. İşletme kapora istiyorsa tutarı ödeme öncesinde gösterilir; kalan tutarı işletmede ödersiniz.',
          'Check the summary and confirm. If the business asks for a deposit, the amount is shown before payment; you pay the rest at the business.',
        ),
      },
    ],
  };
}

/** Added wherever the deposit is explained, for as long as no real money is charged (see config.ts). */
function testModeNote(lang: SeoLang): string {
  if (!PAYMENTS_IN_TEST_MODE) return '';
  return pick(
    lang,
    ' Ödeme ekranında test modu uyarısı görünen işlemlerde kartınızdan gerçek tahsilat yapılmaz ve hizmet bedelinin tamamını işletmede ödersiniz.',
    ' When the payment screen shows a test-mode warning, nothing is actually charged to your card and you pay the full price at the business.',
  );
}

export function depositFaqItem(lang: SeoLang): FaqItem {
  return {
    q: pick(lang, 'Kapora nedir, ne kadar ödenir?', 'What is the deposit and how much is it?'),
    a:
      pick(
        lang,
        'Kapora, randevu oluştururken online ödediğiniz ve hizmet bedelinden düşülen ön ödemedir. Tutarını her işletme kendisi belirler: hizmet fiyatının bir yüzdesi ya da sabit bir tutar olabilir, bazı işletmeler kapora istemez. Kapora tutarı her hizmetin yanında ve ödeme öncesindeki özet ekranında gösterilir; kalan tutarı işletmede ödersiniz.',
        'The deposit is an advance payment you make online when booking; it is deducted from the service price. Each business sets it: a percentage of the service price or a fixed amount, and some businesses ask for none. It is shown next to each service and on the summary before payment; you pay the rest at the business.',
      ) + testModeNote(lang),
  };
}

export function cancellationFaqItem(lang: SeoLang): FaqItem {
  return {
    q: pick(lang, 'Randevumu iptal edebilir miyim?', 'Can I cancel my booking?'),
    a: pick(
      lang,
      'Evet, Randevularım sayfasından iptal edebilirsiniz. İşletmenin sayfasında belirtilen ücretsiz iptal süresi dolmadan (ör. randevuya 24 saat kalana kadar) yaptığınız iptallerde kapora tamamen iade edilir. Bu süre işletmeye göre değişir ve ödeme öncesinde size gösterilir.',
      'Yes, from My bookings. If you cancel before the business’s free-cancellation deadline (for example, up to 24 hours before the appointment), the deposit is refunded in full. The deadline differs per business and is shown to you before payment.',
    ),
    link: { label: pick(lang, 'İptal, Erteleme ve İade Koşulları', 'Cancellation, Rescheduling & Refund Policy'), path: CANCELLATION_POLICY_PATH },
  };
}

/** Questions every listing page can answer the same way. */
export function bookingFaqItems(lang: SeoLang): FaqItem[] {
  return [
    {
      q: pick(lang, 'Online randevu nasıl alınır?', 'How do I book online?'),
      a: pick(
        lang,
        'İşletmenin sayfasında “Randevu al”ı seçin ve dört adımı izleyin: hizmeti seçin, uzmanı seçin (ya da “Fark etmez” deyin), tarih ve saati belirleyin, özeti kontrol edin. Randevu almak için ücretsiz bir Rango müşteri hesabı gerekir.',
        'Choose “Book now” on the business page and follow four steps: pick the service, pick the specialist (or “No preference”), choose the date and time, and check the summary. You need a free Rango customer account to book.',
      ),
    },
    depositFaqItem(lang),
    cancellationFaqItem(lang),
  ];
}

/** `placeName` ("Karşıyaka") makes the call local: "Karşıyaka’da işletmeniz mi var?". */
export function ownerCtaBlock(lang: SeoLang, placeName?: string): Block {
  return {
    kind: 'cta',
    title: placeName
      ? pick(lang, `${locativeTr(placeName)} işletmeniz mi var?`, `Do you run a business in ${placeName}?`)
      : pick(lang, 'İşletme sahibi misiniz?', 'Do you run a business?'),
    text: pick(
      lang,
      'İşletmenizi Rango’ya ekleyin: hizmetlerinizi, fiyatlarınızı ve çalışma saatlerinizi tanımlayın, müşterileriniz sizden online randevu alsın.',
      'Add your business to Rango: set up your services, prices and opening hours, and let customers book you online.',
    ),
    actions: [
      { label: pick(lang, 'İşletmeler için Rango', 'Rango for businesses'), path: FOR_BUSINESS_PATH, primary: true },
      { label: pick(lang, 'İşletme hesabı oluştur', 'Create a business account'), path: BUSINESS_SIGNUP_PATH },
    ],
  };
}
