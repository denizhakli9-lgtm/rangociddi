/**
 * "İşletmeler için" sayfası (`/isletmeler-icin`): işletme sahiplerine Rango'nun ne sunduğunu
 * ve nasıl katılacaklarını anlatır.
 *
 * Yalnızca işletme panelinde gerçekten bulunan özellikler yazılır (src/pages/owner). Komisyon
 * oranı, ödeme takvimi, başvuru süresi gibi panelden değişen ya da belgelenmemiş konularda
 * rakam verilmez. Bkz. common.ts'teki metin kuralı.
 */
import { whatsAppUrl } from '../../contact';
import type { Block, PageModel } from '../blocks';
import { faqItems } from '../blocks';
import { SITE_NAME, breadcrumbSchema, faqSchema, type SeoLang } from '../meta';
import { BUSINESS_SIGNUP_PATH, FAQ_PATH, FOR_BUSINESS_PATH } from './common';

const pick = (lang: SeoLang, tr: string, en: string) => (lang === 'en' ? en : tr);

export function forBusinessPage(lang: SeoLang): PageModel {
  const crumbs = [
    { name: SITE_NAME, path: '/' },
    { name: pick(lang, 'İşletmeler için', 'For businesses'), path: FOR_BUSINESS_PATH },
  ];
  const signup = { label: pick(lang, 'İşletme hesabı oluştur', 'Create a business account'), path: BUSINESS_SIGNUP_PATH, primary: true };
  const whatsapp = {
    label: pick(lang, 'WhatsApp’tan sorun', 'Ask on WhatsApp'),
    path: whatsAppUrl(pick(lang, 'Merhaba, işletmemi Rango’ya eklemek istiyorum.', 'Hello, I would like to add my business to Rango.')),
  };

  const blocks: Block[] = [
    { kind: 'breadcrumb', items: crumbs },
    {
      kind: 'hero',
      // The heading is kept short on purpose: a long one wraps differently once the display font
      // has loaded, which makes the page jump on phones.
      eyebrow: pick(lang, 'Kuaför, berber ve güzellik işletmeleri için', 'For hair, barber and beauty businesses'),
      title: pick(lang, 'Salonunuz için online randevu programı', 'Online booking for your salon'),
      lead: pick(
        lang,
        'Rango, salonunuz için bir online randevu programıdır: müşterileriniz hizmeti, uzmanı ve saati kendisi seçer; siz takviminizi, hizmetlerinizi, ekibinizi ve kazancınızı tek panelden yönetirsiniz. Rango şu anda İzmir’deki işletmelere açıktır.',
        'Rango is an online booking system for your salon: customers pick the service, the specialist and the time themselves, and you manage your calendar, services, team and earnings from one panel. Rango is currently open to businesses in İzmir.',
      ),
      actions: [signup, whatsapp],
    },
    {
      kind: 'features',
      title: pick(lang, 'Rango işletmenize ne sağlar?', 'What Rango gives your business'),
      items: [
        {
          title: pick(lang, 'Online randevu ve canlı takvim', 'Online booking and a live calendar'),
          text: pick(
            lang,
            'Müşterilere yalnızca gerçekten boş olan saatler gösterilir: çalışma saatleriniz, molalarınız, kapattığınız zamanlar ve mevcut randevular kendiliğinden hesaba katılır. Aynı uzmana aynı saatte iki randevu verilmez.',
            'Customers only see times that are really free: your opening hours, breaks, blocked times and existing bookings are taken into account automatically. A specialist is never double-booked.',
          ),
        },
        {
          title: pick(lang, 'Kapora ve iptal kuralları sizde', 'You set the deposit and cancellation rules'),
          text: pick(
            lang,
            'Kaporayı hizmet fiyatının yüzdesi ya da sabit bir tutar olarak siz belirlersiniz; isterseniz kapora almazsınız. Ücretsiz iptal süresini de siz seçersiniz.',
            'You set the deposit as a percentage of the price or as a fixed amount, or take none at all. You also choose the free-cancellation window.',
          ),
        },
        {
          title: pick(lang, 'Onay sizin kontrolünüzde', 'You control confirmation'),
          text: pick(
            lang,
            'Randevuları otomatik onaylayabilir ya da her talebi kendiniz onaylayabilirsiniz. Aynı gün için gelen talepler her zaman onayınıza sunulur.',
            'Confirm bookings automatically or approve each request yourself. Same-day requests always come to you for approval.',
          ),
        },
        {
          title: pick(lang, 'Hizmetler, fiyatlar ve ekip', 'Services, prices and team'),
          text: pick(
            lang,
            'Hizmetlerinizi ad, açıklama, fiyat ve süreyle tanımlayın; çalışanlarınızı ekleyip hangi hizmetleri verdiklerini seçin. Fiyat ve süre değişiklikleri müşteri tarafında hemen güncellenir.',
            'Define your services with name, description, price and duration; add your staff and choose which services each provides. Price and duration changes show up for customers immediately.',
          ),
        },
        {
          title: pick(lang, 'Müşteri takibi', 'Customer records'),
          text: pick(
            lang,
            'Sizden randevu almış müşterilerinizi, ziyaret sayılarını, harcamalarını ve randevu geçmişlerini panelinizde görürsünüz.',
            'See the customers who have booked with you, how often they visit, what they spent and their booking history.',
          ),
        },
        {
          title: pick(lang, 'Kazanç takibi', 'Earnings overview'),
          text: pick(
            lang,
            'Cironuzu, komisyonu, online alınan ve iade edilen kaporaları Kazanç & Komisyon ekranından tek tek izlersiniz.',
            'Follow your revenue, commission, and deposits collected and refunded online on the Earnings & Commission screen.',
          ),
        },
        {
          title: pick(lang, 'Gerçek müşteri değerlendirmeleri', 'Reviews from real customers'),
          text: pick(
            lang,
            'Yalnızca randevusu tamamlanan müşteriler değerlendirme yapabilir. Yorumlara herkese açık yanıt yazabilirsiniz.',
            'Only customers whose booking was completed can leave a review. You can reply publicly.',
          ),
        },
        {
          title: pick(lang, 'Kendi işletme sayfanız', 'Your own business page'),
          text: pick(
            lang,
            'Logo, kapak görseli, fotoğraf galerisi, adres, harita konumu, hizmetler ve çalışma saatleriyle bir işletme sayfanız olur. Sayfanız, ilk hizmetinizi eklediğinizde arama motorlarının dizinine açılır.',
            'You get a business page with logo, cover image, photo gallery, address, map location, services and opening hours. It becomes open to search engines once you add your first service.',
          ),
        },
      ],
    },
    {
      kind: 'steps',
      title: pick(lang, 'Nasıl başlanır?', 'How to get started'),
      items: [
        {
          title: pick(lang, 'İşletme hesabı açın', 'Open a business account'),
          text: pick(lang, 'Kayıt sayfasında hesap türü olarak “İşletme”yi seçin.', 'Choose “Business” as the account type when you register.'),
        },
        {
          title: pick(lang, 'İşletmenizi tanıtın', 'Describe your business'),
          text: pick(
            lang,
            'İşletme adı, kategori, ilçe, adres ve iletişim bilgilerinizi girin. Başvurunuz incelenir; sonuç size bildirilir.',
            'Enter your business name, category, district, address and contact details. Your application is reviewed and you are notified of the result.',
          ),
        },
        {
          title: pick(lang, 'Hizmetlerinizi ve saatlerinizi ekleyin', 'Add your services and hours'),
          text: pick(
            lang,
            'Onay beklerken hizmetlerinizi, ekibinizi ve çalışma saatlerinizi hazırlayın. İşletmeniz onaylandığında yayına alınır ve randevu almaya başlar.',
            'While you wait, set up your services, team and opening hours. Once approved, your business goes live and starts taking bookings.',
          ),
        },
      ],
    },
    {
      kind: 'prose',
      title: pick(lang, 'Ücretlendirme', 'Pricing'),
      paragraphs: [
        pick(
          lang,
          'Rango komisyon modeliyle çalışır. Komisyon, “Tamamlandı” olarak işaretlediğiniz randevuların hizmet bedeli üzerinden hesaplanır ve panelinizdeki Kazanç & Komisyon sayfasında tek tek görünür.',
          'Rango works on commission. It is calculated on the service price of the bookings you mark “Completed” and is listed item by item on the Earnings & Commission page of your panel.',
        ),
        pick(
          lang,
          'Güncel komisyon oranını ve koşulları öğrenmek için bize WhatsApp’tan ya da Künye ve İletişim sayfasındaki adresten ulaşabilirsiniz.',
          'For the current commission rate and terms, contact us on WhatsApp or through the address on the Company & Contact page.',
        ),
      ],
    },
    {
      kind: 'faq',
      title: pick(lang, 'İşletme sahiplerinin sorduğu sorular', 'Questions business owners ask'),
      items: [
        {
          q: pick(lang, 'Hangi işletmeler Rango’ya katılabilir?', 'Which businesses can join Rango?'),
          a: pick(
            lang,
            'İzmir’de hizmet veren kuaförler, berberler, güzellik merkezleri, cilt bakımı, saç bakımı, masaj, spa, manikür, pedikür ve lazer epilasyon işletmeleri katılabilir. Rango şu anda yalnızca İzmir’de hizmet veriyor.',
            'Hair salons, barbers, beauty salons, skin care, hair care, massage, spa, manicure, pedicure and laser hair removal businesses in İzmir can join. Rango currently serves İzmir only.',
          ),
        },
        {
          q: pick(lang, 'Müşteriler bana nasıl ulaşır?', 'How do customers reach me?'),
          a: pick(
            lang,
            'Randevular Rango üzerinden alınır. Bir müşteri randevu oluşturduğunda adı, telefonu, e-postası ve varsa notu, randevunun yürütülmesi için sizinle paylaşılır.',
            'Bookings are made through Rango. When a customer books, their name, phone, e-mail and any note are shared with you so the appointment can take place.',
          ),
        },
        {
          q: pick(lang, 'Telefonla aldığım randevuları da ekleyebilir miyim?', 'Can I add bookings I take by phone?'),
          a: pick(
            lang,
            'Panelden elle randevu eklenemez; randevuları müşteriler oluşturur. Telefonla ya da yüz yüze verdiğiniz randevular için takviminizde ilgili zamanı kapatabilirsiniz; kapatılan saatlerde online randevu alınamaz.',
            'You cannot add bookings by hand; customers create them. For appointments you take by phone or in person you can block that time in your calendar, and blocked times cannot be booked online.',
          ),
        },
        {
          q: pick(lang, 'Randevuya gelmeyen müşteri olursa ne yapabilirim?', 'What can I do if a customer does not show up?'),
          a: pick(
            lang,
            'Randevu saati geldikten sonra randevuyu “Gelmedi” olarak işaretleyebilirsiniz. Kapora ve iptal kurallarının müşteriye nasıl uygulandığı İptal, Erteleme ve İade Koşulları’nda yazılıdır.',
            'Once the appointment time has come you can mark the booking as “No-show”. How the deposit and cancellation rules apply to the customer is set out in the Cancellation, Rescheduling & Refund Policy.',
          ),
          link: { label: pick(lang, 'İptal, Erteleme ve İade Koşulları', 'Cancellation, Rescheduling & Refund Policy'), path: '/yasal/iptal-iade' },
        },
        {
          q: pick(lang, 'Paneli hangi cihazlarda kullanabilirim?', 'On which devices can I use the panel?'),
          a: pick(
            lang,
            'İşletme paneli bilgisayarda ve telefonda, tarayıcı üzerinden kullanılır. Panelin dili Türkçedir.',
            'The business panel works in the browser on computers and phones. The panel is in Turkish.',
          ),
        },
        {
          q: pick(lang, 'Birden fazla şubem var; hepsini tek hesapla yönetebilir miyim?', 'I have several branches. Can I manage them with one account?'),
          a: pick(
            lang,
            'Şu anda bir işletme hesabı tek bir işletmeyi yönetir; çok şubeli yönetim bulunmuyor. Şubeleriniz için bize yazın, birlikte bakalım.',
            'At the moment one business account manages one business; there is no multi-branch management. Message us about your branches and we will look at it together.',
          ),
          link: whatsapp,
        },
      ],
    },
    {
      kind: 'cta',
      title: pick(lang, 'İşletmenizi Rango’ya ekleyin', 'Add your business to Rango'),
      text: pick(
        lang,
        'Hesabınızı açın, işletmenizi tanıtın; hizmetlerinizi ve saatlerinizi ekleyin. Sorularınız için bize yazabilirsiniz.',
        'Open your account, describe your business, and add your services and hours. Message us if you have questions.',
      ),
      actions: [signup, whatsapp, { label: pick(lang, 'Sık sorulan sorular', 'FAQ'), path: FAQ_PATH }],
    },
  ];

  return {
    meta: {
      title: pick(lang, `Kuaför ve Berber Randevu Programı: Online Randevu Sistemi | ${SITE_NAME}`, `Online Booking System for Salons & Barbers | ${SITE_NAME}`),
      description: pick(
        lang,
        'Kuaför, berber, güzellik merkezi ve spa işletmeleri için online randevu programı: canlı takvim, kapora, hizmet ve ekip yönetimi, müşteri takibi. İşletmenizi Rango’ya ekleyin.',
        'Online booking for hair salons, barbers, beauty salons and spas: live calendar, deposits, service and team management, customer book. Add your business to Rango.',
      ),
      path: FOR_BUSINESS_PATH,
      jsonLd: [breadcrumbSchema(crumbs), faqSchema(faqItems(blocks))],
    },
    blocks,
  };
}
