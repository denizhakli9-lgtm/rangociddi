/**
 * Sık Sorulan Sorular sayfası (`/sss`).
 *
 * Yanıtlar uygulamanın davranışını ve yasal metinleri anlatır; iptal, cayma ve iade
 * yanıtları İptal, Erteleme ve İade Koşulları'ndaki (src/pages/legal/legalContent.ts) ifadeyle
 * aynıdır. O metin değişirse buradaki yanıtlar da güncellenmelidir. Bkz. common.ts'teki metin kuralı.
 */
import type { Block, FaqItem, PageModel } from '../blocks';
import { faqItems } from '../blocks';
import { SITE_NAME, breadcrumbSchema, faqSchema, type SeoLang } from '../meta';
import { PAYMENTS_IN_TEST_MODE } from '../config';
import { CANCELLATION_POLICY_PATH, FAQ_PATH, FOR_BUSINESS_PATH, bookingFaqItems, cancellationFaqItem, depositFaqItem, ownerCtaBlock } from './common';

const pick = (lang: SeoLang, tr: string, en: string) => (lang === 'en' ? en : tr);

function bookingGroup(lang: SeoLang): FaqItem[] {
  return [
    {
      q: pick(lang, 'Rango nedir?', 'What is Rango?'),
      a: pick(
        lang,
        'Rango; kuaför, berber, güzellik merkezi, spa ve benzeri kişisel bakım işletmelerinden online randevu almanızı sağlayan aracı bir platformdur. Hizmeti seçtiğiniz işletme sunar; Rango, işletmeyi bulmanızı, uygun saati seçmenizi ve randevunuzu yönetmenizi sağlar.',
        'Rango is an intermediary platform for booking hair salons, barbers, beauty salons, spas and similar personal-care businesses online. The business you choose provides the service; Rango helps you find it, pick a free time and manage your booking.',
      ),
    },
    {
      q: pick(lang, 'Rango’yu kullanmak ücretli mi?', 'Does it cost anything to use Rango?'),
      a: pick(
        lang,
        'Hayır. Hesap oluşturmak ve randevu almak müşteriler için ücretsizdir; Rango sizden ayrıca bir hizmet bedeli almaz. Ödeyeceğiniz toplam tutar, işletmenin belirlediği hizmet fiyatıdır.',
        'No. Creating an account and booking is free for customers; Rango does not charge you a service fee. The total you pay is the service price set by the business.',
      ),
    },
    {
      q: pick(lang, 'Randevu almak için üye olmam gerekiyor mu?', 'Do I need an account to book?'),
      a: pick(
        lang,
        'İşletmeleri, hizmetleri, fiyatları, çalışma saatlerini ve değerlendirmeleri üye olmadan inceleyebilirsiniz. Randevu almak için ücretsiz bir müşteri hesabı gerekir.',
        'You can browse businesses, services, prices, opening hours and reviews without an account. To book you need a free customer account.',
      ),
      link: { label: pick(lang, 'Ücretsiz hesap oluştur', 'Create a free account'), path: '/kayit' },
    },
    bookingFaqItems(lang)[0],
    {
      q: pick(lang, 'Gösterilen saatler gerçekten boş mu?', 'Are the times shown really free?'),
      a: pick(
        lang,
        'Evet. Yalnızca gerçekten uygun olan saatler listelenir; işletmenin çalışma saatleri, molaları ve mevcut randevuları dikkate alınır.',
        'Yes. Only times that are really available are listed; the business’s opening hours, breaks and existing bookings are taken into account.',
      ),
    },
    {
      q: pick(lang, 'Randevum ne zaman kesinleşir?', 'When is my booking confirmed?'),
      a: pick(
        lang,
        'İşletme otomatik onay kullanıyorsa, ertesi gün ve sonrası için aldığınız randevular kapora varsa ödeme adımı tamamlandığında, kapora yoksa randevuyu oluşturduğunuz anda onaylanır. Aynı gün için alınan randevular ile otomatik onay kullanmayan işletmelerin randevuları işletmenin onayını bekler. İşletme talebi reddeder ya da randevu saatine kadar onaylamazsa randevu iptal olur ve ödediğiniz kapora tamamen iade edilir.',
        'If the business uses automatic confirmation, bookings for the next day or later are confirmed once the payment step is completed or, when there is no deposit, as soon as you book. Same-day bookings, and bookings at businesses that do not use automatic confirmation, wait for the business’s approval. If the business declines or does not approve before the start time, the booking is cancelled and your deposit is refunded in full.',
      ),
    },
    {
      q: pick(lang, 'Rango hangi şehirde hizmet veriyor?', 'Where is Rango available?'),
      a: pick(lang, 'Rango şu anda İzmir’de hizmet veriyor.', 'Rango currently serves İzmir, Türkiye.'),
      link: { label: pick(lang, 'İzmir’deki işletmeler', 'Businesses in İzmir'), path: '/izmir' },
    },
  ];
}

function paymentGroup(lang: SeoLang): FaqItem[] {
  return [
    depositFaqItem(lang),
    {
      q: pick(lang, 'Ödeme güvenli mi? Kart bilgilerimi kim görüyor?', 'Is payment secure? Who sees my card details?'),
      a: pick(
        lang,
        'Ödeme hizmetleri PAYTR Ödeme ve Elektronik Para Kuruluşu A.Ş. tarafından sağlanır. Kart bilgilerinizi PayTR’nin güvenli ödeme sayfasında girersiniz ve ödeme, bankanızın 3D Secure doğrulamasıyla tamamlanır. Kart numaranız, son kullanma tarihi ve güvenlik kodu Rango veya işletme tarafından görülmez ve saklanmaz.',
        'Payment services are provided by PAYTR Ödeme ve Elektronik Para Kuruluşu A.Ş. You enter your card details on PayTR’s secure payment page and the payment is completed with your bank’s 3D Secure verification. Your card number, expiry date and security code are never seen or stored by Rango or the business.',
      ),
    },
    // Shown only while no real money is charged (PAYMENTS_IN_TEST_MODE, config.ts).
    ...(PAYMENTS_IN_TEST_MODE
      ? [
          {
            q: pick(lang, 'Ödeme ekranında test modu uyarısı görüyorum; bu ne anlama geliyor?', 'The payment screen shows a test-mode warning. What does that mean?'),
            a: pick(
              lang,
              'Ödeme ekranında “TEST MODU” ya da “PayTR test modu” uyarısı görünüyorsa işlem bir test ödemesidir: kartınızdan gerçek tahsilat yapılmaz ve hizmet bedelinin tamamını işletmede ödersiniz. Ödeme tamamlandığında onay ekranında kapora “test, tahsil edilmedi” olarak gösterilir.',
              'If the payment screen shows “TEST MODE” or “PayTR test mode”, the transaction is a test payment: nothing is actually charged to your card and you pay the full price at the business. After the payment, the confirmation screen shows the deposit as “test, not charged”.',
            ),
          },
        ]
      : []),
    {
      q: pick(lang, 'Fiyatlara vergiler dahil mi?', 'Do prices include taxes?'),
      a: pick(lang, 'Evet. Tüm fiyatlar Türk Lirası cinsindendir ve vergiler dahildir.', 'Yes. All prices are in Turkish Lira and include taxes.'),
    },
  ];
}

function cancellationGroup(lang: SeoLang): FaqItem[] {
  const policy = { label: pick(lang, 'İptal, Erteleme ve İade Koşulları', 'Cancellation, Rescheduling & Refund Policy'), path: CANCELLATION_POLICY_PATH };
  return [
    cancellationFaqItem(lang),
    {
      q: pick(lang, 'Cayma hakkım var mı?', 'Do I have a right of withdrawal?'),
      a: pick(
        lang,
        'Evet. Sözleşmenin kurulduğu günden itibaren 14 gün içinde ve hizmetin ifasına başlanmadan önce, gerekçe göstermeden ve cezai şart ödemeden cayabilirsiniz. Cayma bildirimini Randevularım sayfasındaki “İptal et” seçeneğiyle veya e-postayla yapabilirsiniz.',
        'Yes. Within 14 days of the contract being concluded and before the service starts, you can withdraw without giving a reason and without penalty. You can do so with “Cancel” in My bookings or by e-mail.',
      ),
      link: policy,
    },
    {
      q: pick(lang, 'Randevumu başka bir saate alabilir miyim?', 'Can I move my booking to another time?'),
      a: pick(
        lang,
        'Evet. İşletmenin ücretsiz iptal süresi dolmadan ve platformun tanıdığı erteleme hakkı sayısı kadar, randevunuzu uygun başka bir saate erteleyebilirsiniz.',
        'Yes. Until the business’s free-cancellation deadline, and as many times as the platform’s rescheduling allowance permits, you can move your booking to another free time.',
      ),
    },
    {
      q: pick(lang, 'Randevuya gelemezsem ne olur?', 'What happens if I do not show up?'),
      a: pick(
        lang,
        'Cayma süresi sona ermiş onaylı bir randevuyu iptal süresi geçtikten sonra iptal eder veya bildirimde bulunmadan randevuya gelmezseniz kapora, işletmenin ayırdığı zamanın karşılığı olarak iade edilmez.',
        'If you cancel a confirmed booking after the free-cancellation deadline has passed (and the withdrawal period has ended), or do not show up without notice, the deposit is not refunded, in return for the time the business reserved.',
      ),
      link: policy,
    },
    {
      q: pick(lang, 'İşletme randevumu iptal ederse ne olur?', 'What if the business cancels my booking?'),
      a: pick(
        lang,
        'Randevu talebiniz işletme tarafından reddedilir, onaylanmadan zaman aşımına uğrar veya randevunuz işletme tarafından iptal edilirse kapora tamamen iade edilir.',
        'If the business declines your request, lets it expire without approving it, or cancels your booking, the deposit is refunded in full.',
      ),
    },
    {
      q: pick(lang, 'İade ne zaman hesabıma geçer?', 'When will I receive a refund?'),
      a: pick(
        lang,
        'Kartla ödenen kaporaların iadesi, ödemede kullandığınız karta PayTR aracılığıyla yapılır. İade talebiniz onaylandıktan sonra tutarın hesabınıza yansıması bankanıza bağlı olarak genellikle 2–10 iş günü sürer.',
        'Deposits paid by card are refunded to the same card through PayTR. Once your refund request is approved, it usually takes 2–10 business days to reach your account, depending on your bank.',
      ),
      link: policy,
    },
  ];
}

function reviewGroup(lang: SeoLang): FaqItem[] {
  return [
    {
      q: pick(lang, 'Kimler değerlendirme yapabilir?', 'Who can leave a review?'),
      a: pick(
        lang,
        'Yalnızca randevusu tamamlanan müşteriler değerlendirme yapabilir: her randevu için bir kez, 1–5 yıldız ve isteğe bağlı bir yorumla. İşletme puanı, yayındaki bu değerlendirmelerin ortalamasıdır; işletmeler yorumlara herkese açık yanıt yazabilir.',
        'Only customers whose booking was completed can leave a review: once per booking, with 1–5 stars and an optional comment. A business’s rating is the average of these published reviews; businesses can reply publicly.',
      ),
    },
  ];
}

function businessGroup(lang: SeoLang): FaqItem[] {
  return [
    {
      q: pick(lang, 'İşletmemi Rango’ya nasıl eklerim?', 'How do I add my business to Rango?'),
      a: pick(
        lang,
        '“İşletme” türünde bir hesap açıp işletme formunu doldurun: işletme adı, kategori, ilçe, adres ve iletişim bilgileri. Başvurunuz incelenir; onaylandıktan sonra işletmeniz yayına alınır. Onay beklerken hizmetlerinizi, ekibinizi ve çalışma saatlerinizi hazırlayabilirsiniz.',
        'Open a “Business” account and fill in the business form: name, category, district, address and contact details. Your application is reviewed and your business goes live once it is approved. While you wait you can set up your services, team and opening hours.',
      ),
      link: { label: pick(lang, 'İşletmeler için Rango', 'Rango for businesses'), path: FOR_BUSINESS_PATH },
    },
    {
      q: pick(lang, 'Rango işletmelerden nasıl ücret alır?', 'How does Rango charge businesses?'),
      a: pick(
        lang,
        'Rango komisyon modeliyle çalışır: komisyon, “Tamamlandı” olarak işaretlenen randevuların hizmet bedeli üzerinden hesaplanır ve işletme panelindeki Kazanç & Komisyon sayfasında görünür. Güncel oran ve koşullar için bizimle iletişime geçebilirsiniz.',
        'Rango works on commission: it is calculated on the service price of bookings marked “Completed” and is shown on the Earnings & Commission page of the business panel. Contact us for the current rate and terms.',
      ),
      link: { label: pick(lang, 'Künye ve İletişim', 'Company & Contact'), path: '/yasal/kunye' },
    },
    {
      q: pick(lang, 'Kaporayı ve iptal süresini kim belirler?', 'Who sets the deposit and the cancellation window?'),
      a: pick(
        lang,
        'Her işletme kendi panelinden belirler: kapora, hizmet fiyatının bir yüzdesi ya da sabit bir tutar olabilir (isteyen işletme kapora almaz); ücretsiz iptal süresi de işletmenin tercihidir.',
        'Each business sets them in its panel: the deposit can be a percentage of the price or a fixed amount (or none), and the free-cancellation window is also the business’s choice.',
      ),
    },
  ];
}

function accountGroup(lang: SeoLang): FaqItem[] {
  return [
    {
      q: pick(lang, 'Kişisel verilerim nasıl korunuyor?', 'How is my personal data protected?'),
      a: pick(
        lang,
        'Rango reklam veya analitik amaçlı çerez kullanmaz. Profil sayfanızdan verilerinizin bir kopyasını indirebilir ve hesabınızı silebilirsiniz. Verilerinizin hangi amaçlarla işlendiği ve kimlerle paylaşıldığı KVKK Aydınlatma Metni’nde açıklanır.',
        'Rango does not use advertising or analytics cookies. From your profile you can download a copy of your data and delete your account. The Privacy Notice (KVKK) explains why your data is processed and with whom it is shared.',
      ),
      link: { label: pick(lang, 'KVKK Aydınlatma Metni', 'Privacy Notice (KVKK)'), path: '/yasal/aydinlatma-metni' },
    },
    {
      q: pick(lang, 'Destek almak için ne yapmalıyım?', 'How do I get support?'),
      a: pick(
        lang,
        'Giriş yaptıktan sonra Yardım ve Destek sayfasından destek talebi oluşturabilir ya da WhatsApp destek hattımıza yazabilirsiniz. İletişim bilgilerimiz Künye ve İletişim sayfasında yer alır.',
        'After signing in you can open a request from Help & support, or message our WhatsApp support line. Our contact details are on the Company & Contact page.',
      ),
      link: { label: pick(lang, 'Künye ve İletişim', 'Company & Contact'), path: '/yasal/kunye' },
    },
  ];
}

export function faqPage(lang: SeoLang): PageModel {
  const crumbs = [
    { name: SITE_NAME, path: '/' },
    { name: pick(lang, 'Sık sorulan sorular', 'FAQ'), path: FAQ_PATH },
  ];
  const blocks: Block[] = [
    { kind: 'breadcrumb', items: crumbs },
    {
      kind: 'hero',
      eyebrow: pick(lang, 'Yardım', 'Help'),
      title: pick(lang, 'Sık sorulan sorular', 'Frequently asked questions'),
      lead: pick(
        lang,
        'Rango ile randevu alma, kapora ve ödeme, iptal ve iade ile işletmelerin katılımı hakkında en çok sorulan soruların yanıtları.',
        'Answers to the most common questions about booking with Rango, deposits and payment, cancellations and refunds, and how businesses join.',
      ),
    },
    { kind: 'faq', title: pick(lang, 'Randevu alma', 'Booking'), items: bookingGroup(lang) },
    { kind: 'faq', title: pick(lang, 'Kapora ve ödeme', 'Deposit and payment'), items: paymentGroup(lang) },
    { kind: 'faq', title: pick(lang, 'İptal, erteleme ve iade', 'Cancelling, rescheduling and refunds'), items: cancellationGroup(lang) },
    { kind: 'faq', title: pick(lang, 'Değerlendirmeler', 'Reviews'), items: reviewGroup(lang) },
    { kind: 'faq', title: pick(lang, 'İşletmeler', 'Businesses'), items: businessGroup(lang) },
    { kind: 'faq', title: pick(lang, 'Hesap, gizlilik ve destek', 'Account, privacy and support'), items: accountGroup(lang) },
    {
      kind: 'cta',
      title: pick(lang, 'Randevunuzu şimdi oluşturun', 'Make your booking now'),
      text: pick(lang, 'İzmir’deki işletmeleri inceleyin, size uyan saati seçin.', 'Browse businesses in İzmir and pick a time that suits you.'),
      actions: [
        { label: pick(lang, 'İşletmeleri keşfet', 'Discover businesses'), path: '/izmir', primary: true },
        { label: pick(lang, 'Kategoriler', 'Categories'), path: '/kategoriler' },
      ],
    },
    ownerCtaBlock(lang),
  ];
  return {
    meta: {
      title: pick(lang, `Sık Sorulan Sorular: Randevu, Kapora, İptal ve İade | ${SITE_NAME}`, `FAQ: Booking, Deposits, Cancellations & Refunds | ${SITE_NAME}`),
      description: pick(
        lang,
        'Rango’da online randevu nasıl alınır, kapora nedir, randevu nasıl iptal edilir, iade ne zaman yapılır, işletmeler nasıl katılır? Soruların yanıtları.',
        'How to book online with Rango, what the deposit is, how to cancel, when refunds arrive and how businesses join: answers to frequently asked questions.',
      ),
      path: FAQ_PATH,
      jsonLd: [breadcrumbSchema(crumbs), faqSchema(faqItems(blocks))],
    },
    blocks,
  };
}
