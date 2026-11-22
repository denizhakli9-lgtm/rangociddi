/**
 * Sample (fictional) content shown in the store screenshots.
 *
 * Nothing here comes from the live database: the businesses follow the project's own demo
 * catalogue (supabase/migrations/…_seed_izmir_pilot_data.sql), the customer and the staff are
 * invented, and the photos are the illustrative sector pictures from /public.
 * Change the texts here and run `node magaza-gorselleri/generator/run.mjs` to regenerate.
 */

/** The moment the screenshots are "taken": a Tuesday morning, so salons are open. */
export const NOW = '2026-12-08T10:30:00+03:00';

export const USER_ID = '7d4c2f1e-5b3a-4e8f-9c21-6a0d3b9e4f10';
const OWNER_ID = '11111111-2222-4333-8444-555555555555';

/** Where the customer is: distances on the cards are measured from here. */
export const LOCATION = { label: 'Alsancak', lat: 38.4375, lng: 27.1435 };

export const PROFILE = {
  id: USER_ID,
  role: 'customer',
  full_name: 'Ayşe Korkmaz',
  email: 'ayse@example.com',
  phone: '0532 000 00 00',
  gender: 'female',
  city: 'İzmir',
  district: LOCATION.label,
  latitude: 38.44,
  longitude: 27.14,
  avatar_url: null,
  locale: 'tr',
  is_suspended: false,
  onboarding_done: true,
  created_at: '2026-09-14T09:00:00+03:00',
};

/** The platform as customers see it once deposits are collected through PayTR (not test mode). */
export const SETTINGS = {
  id: 1,
  commission_rate: 10,
  payment_mode: 'live',
  payment_provider: 'paytr',
  paytr_test_mode: false,
  pending_payment_minutes: 15,
  slot_interval_minutes: 30,
  min_lead_minutes: 60,
  max_booking_days: 60,
  max_reschedules: 2,
};

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** The platform's categories, in the order the app lists them (as of November 2026). */
export const CATEGORIES = [
  ['pt', 'Personal Trainer', '', 'footprints'],
  ['kuafor', 'Kuaför', 'Kesim, renklendirme ve şekillendirme', 'scissors'],
  ['berber', 'Berber', 'Klasik kesim, sakal ve tıraş ritüelleri', 'brush'],
  ['guzellik-merkezi', 'Güzellik Merkezi', 'Makyaj, kaş, kirpik ve bütünsel bakım', 'sparkles'],
  ['cilt-bakimi', 'Cilt Bakımı', 'Profesyonel yüz ve cilt bakımları', 'droplets'],
  ['masaj', 'Masaj', 'Rahatlatıcı ve terapötik masajlar', 'waves'],
  ['spa', 'Spa', 'Hamam, spa ritüelleri ve wellness', 'flower'],
  ['manikur', 'Manikür', 'Manikür, kalıcı oje ve nail art', 'hand'],
  ['pedikur', 'Pedikür', 'Ayak bakımı ve spa pedikür', 'footprints'],
  ['lazer-epilasyon', 'Lazer Epilasyon', 'Son teknoloji lazer uygulamaları', 'zap'],
  ['sac-bakimi', 'Saç Bakımı', 'Keratin, botoks ve onarıcı bakımlar', 'wind'],
].map(([slug, name, description, icon], i) => ({
  id: uuid(100 + i),
  slug,
  name,
  description,
  icon,
  image_url: null,
  sort_order: i,
  is_active: true,
}));

const category = (slug) => CATEGORIES.find((c) => c.slug === slug);

/** Services per category: [name, description, price (TRY), minutes]. */
const SERVICES_BY_CATEGORY = {
  kuafor: [
    ['Kesim & Fön', 'Yüz hattınıza uygun kesim ve profesyonel fön', 750, 60],
    ['Fön', 'Hacimli veya düz fön', 400, 45],
    ['Boya', 'Tek renk saç boyası ve bakım', 1800, 120],
    ['Röfle / Balyaj', 'El yapımı balyaj ve ışıltılı röfle', 2800, 150],
    ['Gelin Saçı', 'Prova dahil gelin saçı tasarımı', 4500, 180],
  ],
  berber: [
    ['Saç Kesimi', 'Yıkama ve şekillendirme dahil', 450, 30],
    ['Sakal Tasarımı', 'Ustura ile sakal şekillendirme', 250, 20],
    ['Saç & Sakal', 'Komple bakım paketi', 600, 45],
    ['Sıcak Havlu Tıraşı', 'Geleneksel ustura tıraşı', 400, 30],
  ],
  'guzellik-merkezi': [
    ['Kaş Tasarımı', 'Yüz analizi ile kaş şekillendirme', 350, 30],
    ['Kirpik Lifting', 'Doğal kıvrım ve besleyici bakım', 900, 60],
    ['Profesyonel Makyaj', 'Özel gün ve davet makyajı', 2000, 90],
  ],
  'cilt-bakimi': [
    ['Klasik Cilt Bakımı', 'Derin temizlik ve nemlendirme', 1200, 60],
    ['Hydrafacial', 'Çok adımlı hydrafacial uygulaması', 2000, 75],
    ['Anti-Aging Bakım', 'Sıkılaştırıcı yaşlanma karşıtı bakım', 2500, 90],
  ],
  masaj: [
    ['İsveç Masajı', 'Klasik rahatlatıcı tam vücut masajı', 1500, 60],
    ['Aromaterapi Masajı', 'Doğal esansiyel yağlarla masaj', 1800, 60],
    ['Sıcak Taş Masajı', 'Volkanik taşlarla derin rahatlama', 2200, 90],
  ],
  spa: [
    ['Köpük Masajı', 'Hamamda köpük masajı', 900, 45],
    ['Hamam & Kese', 'Geleneksel kese ve köpük', 1200, 60],
    ['Spa Ritüeli', 'Hamam, masaj ve yüz bakımı paketi', 3500, 150],
  ],
  manikur: [
    ['Nail Art', 'Kişiye özel tırnak sanatı', 300, 30],
    ['Klasik Manikür', 'Tırnak ve kütikül bakımı', 400, 45],
    ['Kalıcı Oje', 'Uzun ömürlü jel oje uygulaması', 600, 60],
    ['Protez Tırnak', 'Jel veya akrilik protez tırnak', 1200, 120],
  ],
};

/**
 * [slug, name, category, district, address, lat, lng, gender, deposit %, cancel hours, featured,
 *  rating, reviews, bookings, photos, description]
 */
const BUSINESS_ROWS = [
  ['maison-lumiere', 'Maison Lumière', 'kuafor', 'Alsancak', 'Kıbrıs Şehitleri Caddesi No:42 Kat:1', 38.4406, 27.1452, 'female', 20, 24, true, 4.9, 128, 940,
    ['sector-hair', 'sector-hair-2', 'sector-beauty-2'], 'Paris esintili salonumuzda kişiye özel kesim ve renk danışmanlığı.'],
  ['nail-couture', 'Nail Couture', 'manikur', 'Alsancak', '1453. Sk. No:12', 38.4392, 27.1451, 'female', 20, 12, true, 4.8, 112, 610,
    ['sector-nails', 'sector-nails-2'], 'Haute couture tırnak tasarımları ve kusursuz kalıcı oje.'],
  ['gentlemens-club', 'Gentlemen’s Club Barber', 'berber', 'Alsancak', 'Talatpaşa Blv. No:18', 38.4331, 27.1418, 'male', 20, 6, true, 4.8, 96, 820,
    ['sector-barber', 'sector-barber-2'], 'Klasik berber geleneği, sıcak havlu tıraşı ve özenli sakal tasarımı.'],
  ['pure-skin', 'Pure Skin Clinic', 'cilt-bakimi', 'Alsancak', 'Cumhuriyet Blv. No:140', 38.4312, 27.1378, 'unisex', 25, 24, true, 4.9, 74, 530,
    ['sector-beauty', 'sector-beauty-2'], 'Cilt analizine dayalı kişisel bakım protokolleri.'],
  ['aegean-spa', 'Aegean Spa', 'spa', 'Alsancak', 'Ali Çetinkaya Bulvarı No:27 Kat:2', 38.4310, 27.1390, 'unisex', 25, 24, true, 4.9, 58, 470,
    ['sector-spa', 'sector-spa-2'], 'Ege’ye özgü doğal ürünlerle hamam ve spa ritüelleri.'],
  ['atelier-noir', 'Atelier Noir Hair Studio', 'kuafor', 'Karşıyaka', 'Cemal Gürsel Cd. No:310', 38.4600, 27.1100, 'unisex', 20, 12, true, 4.8, 87, 690,
    ['sector-hair-2', 'sector-hair'], 'Modern kesim teknikleri ve trend renklendirmeler için butik stüdyo.'],
  ['velvet-lounge', 'Velvet Beauty Lounge', 'guzellik-merkezi', 'Göztepe', 'Mithatpaşa Cd. No:1020', 38.3970, 27.0850, 'female', 20, 24, false, 4.7, 41, 280,
    ['sector-beauty-2', 'sector-beauty'], 'Deniz manzaralı lounge’umuzda bütünsel güzellik ritüelleri.'],
  ['serenity-masaj', 'Serenity Masaj Evi', 'masaj', 'Balçova', 'Mithatpaşa Cd. No:1250', 38.3900, 27.0450, 'unisex', 20, 12, false, 4.8, 63, 350,
    ['sector-spa-2', 'sector-spa'], 'Uzman terapistlerle zihni ve bedeni dinlendiren masaj seansları.'],
  ['black-blade', 'Black Blade Barbershop', 'berber', 'Karşıyaka', 'Bostanlı Mh. 2040. Sk. No:5', 38.4560, 27.1180, 'male', 20, 6, false, 4.7, 152, 1010,
    ['sector-barber-2', 'sector-barber'], 'Fade, skin fade ve modern erkek kesimlerinde iddialı ekip.'],
  ['lacquer-co', 'Lacquer & Co. Nail Bar', 'manikur', 'Karşıyaka', 'Kemalpaşa Cd. No:44', 38.4580, 27.1130, 'female', 20, 6, false, 4.6, 39, 240,
    ['sector-nails-2', 'sector-nails'], 'Hızlı, hijyenik ve şık nail bar deneyimi.'],
];

/**
 * Photos are served from the app's own storage address, so they render exactly like a
 * business's uploaded cover (mock-api.mjs answers these URLs with the files in /public).
 */
export const MEDIA_PATH = '/storage/v1/object/public/business-media/';
const photo = (origin, name) => `${origin}${MEDIA_PATH}ornek/${name}.webp`;

const STAFF = {
  'maison-lumiere': [['Selin Demir', 'Kıdemli Saç Tasarımcısı'], ['Ece Arslan', 'Renk Uzmanı'], ['Defne Çelik', 'Saç Tasarımcısı']],
  'nail-couture': [['Melis Aydın', 'Nail Artist'], ['İpek Şahin', 'Manikür Uzmanı']],
  'gentlemens-club': [['Emre Yıldız', 'Usta Berber'], ['Kerem Polat', 'Berber']],
  'pure-skin': [['Zeynep Kaya', 'Cilt Bakım Uzmanı'], ['Derya Koç', 'Estetisyen']],
  'aegean-spa': [['Naz Erdem', 'Spa Terapisti'], ['Can Aksoy', 'Masaj Terapisti']],
};

const REVIEWS = {
  'maison-lumiere': [
    ['Zeynep A.', 'Röfle / Balyaj', 5, 'Balyajım tam istediğim tonda oldu. Selin Hanım çok ilgiliydi, randevu saatinde alındım.', '2026-12-05T16:20:00+03:00', 'Güzel yorumunuz için teşekkür ederiz, yine bekleriz.'],
    ['Elif T.', 'Kesim & Fön', 5, 'Salon tertemiz, ekip güler yüzlü. Kesim de fön de çok başarılı.', '2026-12-02T12:05:00+03:00', null],
    ['Merve K.', 'Boya', 4, 'Renk çok güzel oldu, işlem biraz uzun sürdü ama sonuca değdi.', '2026-11-27T18:40:00+03:00', null],
    ['Buse Y.', 'Fön', 5, 'Hızlı ve özenli, fönüm bütün gün bozulmadı.', '2026-11-20T10:15:00+03:00', null],
  ],
};

export function buildData(origin) {
  const businesses = BUSINESS_ROWS.map((r, i) => {
    const [slug, name, cat, district, address, latitude, longitude, gender_focus, deposit_value, cancellation_hours, is_featured, rating_avg, review_count, booking_count, photos, description] = r;
    const c = category(cat);
    const prices = SERVICES_BY_CATEGORY[cat].map((s) => s[2]);
    return {
      id: uuid(200 + i),
      owner_id: OWNER_ID,
      category_id: c.id,
      name,
      slug,
      description,
      address,
      district,
      city: 'İzmir',
      latitude,
      longitude,
      logo_url: null,
      cover_url: photo(origin, photos[0]),
      gallery: photos.slice(1).map((p) => photo(origin, p)),
      gender_focus,
      deposit_type: 'percentage',
      deposit_value,
      cancellation_hours,
      auto_confirm: true,
      status: 'approved',
      is_verified: true,
      is_featured,
      rating_avg,
      review_count,
      booking_count,
      min_price: Math.min(...prices),
      created_at: '2026-10-01T09:00:00+03:00',
      categories: { name: c.name, slug: c.slug, icon: c.icon },
      _category: cat,
    };
  });

  const services = [];
  const employees = [];
  const workingHours = [];
  const reviews = [];
  businesses.forEach((b, bi) => {
    SERVICES_BY_CATEGORY[b._category].forEach(([name, description, price, duration_minutes], si) => {
      services.push({ id: uuid(1000 + bi * 10 + si), business_id: b.id, name, description, price, duration_minutes, is_active: true, sort_order: si + 1 });
    });
    const own = services.filter((s) => s.business_id === b.id);
    (STAFF[b.slug] ?? [['Merve Kaplan', 'Uzman']]).forEach(([full_name, title], ei) => {
      employees.push({
        id: uuid(2000 + bi * 10 + ei),
        business_id: b.id,
        full_name,
        title,
        bio: '',
        avatar_url: null,
        is_active: true,
        sort_order: ei + 1,
        employee_services: own.map((s) => ({ service_id: s.id })),
      });
    });
    const openSunday = ['spa', 'masaj'].includes(b._category);
    for (let weekday = 1; weekday <= 7; weekday++) {
      workingHours.push({
        id: uuid(3000 + bi * 10 + weekday),
        business_id: b.id,
        weekday,
        is_closed: weekday === 7 && !openSunday,
        open_time: weekday === 7 ? '10:00:00' : '09:00:00',
        close_time: weekday === 7 ? '18:00:00' : '20:00:00',
        break_start: null,
        break_end: null,
      });
    }
    (REVIEWS[b.slug] ?? []).forEach(([reviewer_name, service_name, rating, comment, created_at, owner_reply], ri) => {
      reviews.push({ id: uuid(4000 + bi * 10 + ri), appointment_id: uuid(4500 + bi * 10 + ri), business_id: b.id, employee_id: null, rating, comment, reviewer_name, service_name, owner_reply, is_hidden: false, created_at });
    });
  });

  const biz = (slug) => businesses.find((b) => b.slug === slug);
  const svc = (slug, name) => services.find((s) => s.business_id === biz(slug).id && s.name === name);
  const emp = (slug, name) => employees.find((e) => e.business_id === biz(slug).id && e.full_name === name);

  /** [id, code, business, service, specialist, start, status, created, payment status] */
  const APPOINTMENT_ROWS = [
    [uuid(5001), 'VY7K2M9QA4XD', 'maison-lumiere', 'Kesim & Fön', 'Selin Demir', '2026-12-10T14:30:00+03:00', 'confirmed', '2026-12-08T10:24:00+03:00', 'paid'],
    [uuid(5002), 'VY3F8T1LC6PW', 'pure-skin', 'Hydrafacial', 'Zeynep Kaya', '2026-12-16T11:00:00+03:00', 'confirmed', '2026-12-06T19:12:00+03:00', 'paid'],
    [uuid(5003), 'VY9B4H6RE2NU', 'nail-couture', 'Kalıcı Oje', 'Melis Aydın', '2026-12-19T16:00:00+03:00', 'pending_approval', '2026-12-07T21:40:00+03:00', 'paid'],
    [uuid(5004), 'VY5D1J7SG3MZ', 'aegean-spa', 'Hamam & Kese', 'Naz Erdem', '2026-11-28T15:00:00+03:00', 'completed', '2026-11-22T13:05:00+03:00', 'paid'],
    [uuid(5005), 'VY2C6N8VK5QY', 'maison-lumiere', 'Fön', 'Ece Arslan', '2026-11-14T12:00:00+03:00', 'completed', '2026-11-10T09:30:00+03:00', 'paid'],
  ];

  const appointments = APPOINTMENT_ROWS.map(([id, booking_code, slug, serviceName, employeeName, starts_at, status, created_at, payStatus], i) => {
    const b = biz(slug);
    const s = svc(slug, serviceName);
    const e = emp(slug, employeeName);
    const deposit = Math.round(s.price * b.deposit_value) / 100;
    return {
      id,
      booking_code,
      customer_id: USER_ID,
      business_id: b.id,
      service_id: s.id,
      employee_id: e.id,
      starts_at,
      ends_at: new Date(Date.parse(starts_at) + s.duration_minutes * 60000).toISOString(),
      status,
      service_name: s.name,
      employee_name: e.full_name,
      duration_minutes: s.duration_minutes,
      total_price: s.price,
      deposit_amount: deposit,
      remaining_amount: s.price - deposit,
      customer_note: '',
      cancelled_by: null,
      cancellation_reason: null,
      cancelled_at: null,
      reschedule_count: 0,
      cancellation_hours: b.cancellation_hours,
      created_at,
      businesses: {
        id: b.id, owner_id: b.owner_id, name: b.name, slug: b.slug, cover_url: b.cover_url, address: `${b.address}, ${b.district}`, district: b.district, city: b.city,
        latitude: b.latitude, longitude: b.longitude, cancellation_hours: b.cancellation_hours, auto_confirm: b.auto_confirm,
        categories: { name: b.categories.name, slug: b.categories.slug },
      },
      payments: [{ id: uuid(6000 + i), status: payStatus, amount: deposit, card_last4: '4242', provider_payment_id: `PAYTR-${booking_code}`, payment_type: 'deposit' }],
      reviews: i === 4 ? [{ id: uuid(6500) }] : [],
    };
  });

  const favorites = ['maison-lumiere', 'nail-couture', 'aegean-spa', 'pure-skin'].map((slug, i) => ({
    business_id: biz(slug).id,
    created_at: new Date(Date.parse(NOW) - (i + 1) * 86400000).toISOString(),
    businesses: biz(slug),
  }));

  const notifications = [
    { id: uuid(7001), user_id: USER_ID, type: 'appointment_confirmed', title: 'Randevunuz onaylandı', body: 'Maison Lumière · 10 Aralık Perşembe 14:30', link: '/randevularim', is_read: false, created_at: '2026-12-08T10:25:00+03:00' },
    { id: uuid(7002), user_id: USER_ID, type: 'appointment_reminder', title: 'Randevu hatırlatması', body: 'Pure Skin Clinic · 16 Aralık Çarşamba 11:00', link: '/randevularim', is_read: false, created_at: '2026-12-08T09:00:00+03:00' },
  ];

  return { businesses, services, employees, workingHours, reviews, appointments, favorites, notifications };
}

/** Times already booked on any day, so the offered times look like a real, partly full calendar. */
const TAKEN = new Set(['10:00', '11:30', '13:00', '13:30', '18:00']);

export function slotsFor(date, employeeIds, durationMinutes) {
  const out = [];
  const earliest = Date.parse(NOW) + SETTINGS.min_lead_minutes * 60000;
  for (let minutes = 9 * 60; minutes + durationMinutes <= 20 * 60; minutes += SETTINGS.slot_interval_minutes) {
    const label = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    if (TAKEN.has(label)) continue;
    const slot_start = `${date}T${label}:00+03:00`;
    if (Date.parse(slot_start) < earliest) continue;
    out.push({ slot_start, slot_employee_id: employeeIds[out.length % employeeIds.length] });
  }
  return out;
}
