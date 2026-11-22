/**
 * Google Play ekran görüntülerini üretir: magaza-gorselleri/play-store/*.png (1080×1920).
 *
 *   npm run build
 *   node magaza-gorselleri/generator/run.mjs          (hepsi)
 *   node magaza-gorselleri/generator/run.mjs 03 07    (yalnızca 3. ve 7. görsel)
 *
 * Gerekenler: derlenmiş uygulama (dist/) ve Playwright ile Chromium
 * (`npm i -D playwright && npx playwright install chromium`).
 *
 * Görseller gerçek uygulamanın ekranlarıdır. İçerik (işletmeler, randevular) sample-data.mjs
 * dosyasındaki örnek veridir; canlı veritabanına hiç bağlanılmaz. Başlıkları ve hangi ekranın
 * çekileceğini aşağıdaki FRAMES listesinden değiştirebilirsiniz.
 */
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp } from './capture.mjs';
import { DEVICE, layoutFor, openComposer } from './compose.mjs';
import { NOW } from './sample-data.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Google Play phone screenshots: 9:16, at least 1080 px wide. */
const CANVAS = { width: 1080, height: 1920 };
const OUT_DIR = join(root, 'magaza-gorselleri/play-store');

/** Phone placement inside the 1080-wide frame: width of its screen and where its top edge sits. */
const PHONE = { screenWidth: 770, phoneTop: 530 };

const tap = (page, name) => page.getByRole('button', { name }).first().click();
/** Scrolls until the element sits `offset` px below the top of the screen (the app's header is 64 px tall). */
const scrollToElement = (locator, offset) => locator.evaluate((el, y) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - y), offset);

/** The booking page of the sample salon with a service already chosen, as when tapping "Seç" on its profile. */
const bookingPath = (data) => `/i/maison-lumiere/randevu?hizmet=${data.services.find((s) => s.name === 'Kesim & Fön').id}`;

/** Specialist → day → time, the way a customer taps through it. */
async function pickTime(page) {
  await tap(page, /Selin Demir/);
  await tap(page, /Per\s*10/);
  await tap(page, '14:30');
}

/**
 * One entry per picture, in store order. `title`: a line break splits the two lines and *…* is
 * set in gold. `screen.path` is the app page, `screen.prepare` what to tap or scroll before the
 * picture is taken, `theme: 'dark'` shows the app's dark mode.
 */
const FRAMES = [
  {
    id: '01-kesfet',
    wordmark: true,
    title: 'İzmir’in seçkin\n*salonları cebinde.*',
    sub: 'Kuaför, berber, güzellik ve spa: hepsi tek uygulamada.',
    screen: { path: '/kesfet' },
  },
  {
    id: '02-yakininda',
    eyebrow: 'Yakınında',
    title: 'Sana en yakın\n*salonu bul.*',
    sub: 'Konumuna göre sırala; puanı, fiyatı ve mesafeyi gör.',
    screen: { path: '/ara', prepare: (page) => scrollToElement(page.getByRole('search'), 80) },
  },
  {
    id: '03-salon',
    eyebrow: 'Salon profili',
    title: 'Gitmeden önce\n*her şeyi gör.*',
    sub: 'Fotoğraflar, hizmetler, fiyatlar ve müşteri yorumları.',
    screen: { path: '/i/maison-lumiere' },
  },
  {
    id: '04-saat-sec',
    eyebrow: 'Tarih ve saat',
    title: 'Saniyeler içinde\n*randevu al.*',
    sub: 'Hizmetini, uzmanını ve sana uyan saati seç.',
    screen: { path: bookingPath, prepare: pickTime },
  },
  {
    id: '05-kapora',
    eyebrow: 'Ödeme özeti',
    title: 'Küçük bir kaporayla\n*yerin ayrılsın.*',
    sub: 'Kalan tutarı randevu günü işletmede ödersin.',
    screen: {
      path: bookingPath,
      prepare: async (page) => {
        await pickTime(page);
        await tap(page, 'Devam Et');
        await scrollToElement(page.getByRole('heading', { name: 'Randevu oluştur' }), 74);
      },
    },
  },
  {
    id: '06-onay',
    eyebrow: 'Rezervasyon',
    title: 'Onay geldi,\n*yerin hazır.*',
    sub: 'Kodun, saatin ve yol tarifin tek ekranda.',
    screen: { path: (data) => `/onay/${data.appointments[0].id}` },
  },
  {
    id: '07-randevularim',
    eyebrow: 'Kontrol sende',
    title: 'Planın değişirse\n*kolayca ertele.*',
    sub: 'Tüm randevuların tek yerde: ertele ya da iptal et.',
    theme: 'dark',
    screen: { path: '/randevularim' },
  },
  {
    id: '08-karanlik-mod',
    eyebrow: 'Karanlık mod',
    title: 'Gece gündüz\n*aynı şıklık.*',
    sub: 'Aydınlık ve karanlık tema arasında tek dokunuşla geç.',
    theme: 'dark',
    screen: { path: '/i/aegean-spa' },
  },
];

const only = process.argv.slice(2);
const selected = FRAMES.filter((frame) => !only.length || only.some((prefix) => frame.id.startsWith(prefix)));
if (!selected.length) throw new Error(`Eşleşen görsel yok: ${only.join(', ')}`);

const layout = layoutFor({ canvas: CANVAS, ...PHONE });
/** The phone's status bar shows the moment the sample data is set at. */
const clock = NOW.slice(11, 16);

const workDir = await mkdtemp(join(tmpdir(), 'rango-magaza-'));
await mkdir(OUT_DIR, { recursive: true });
const app = await openApp(root);
const composer = await openComposer({ canvas: CANVAS, workDir });
try {
  for (const frame of selected) {
    const { path, prepare } = frame.screen;
    const capture = await app.capture(
      { path: typeof path === 'function' ? path(app.data) : path, prepare, theme: frame.theme },
      { width: DEVICE.width, height: layout.appHeight, scale: layout.captureScale },
    );
    await composer.compose({ ...frame, clock, flip: FRAMES.indexOf(frame) % 2 === 1 }, layout, capture, join(OUT_DIR, `${frame.id}.png`));
    console.log(`✓ ${frame.id}.png`);
  }
} finally {
  await composer.close();
  await app.close();
  await rm(workDir, { recursive: true, force: true });
}
