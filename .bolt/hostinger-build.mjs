// Hostinger derleme köprüsü.
//
// Hostinger'daki Node.js uygulamasının "Kök dizin" (root directory) ayarı `.bolt`
// olarak kalmış; Hostinger bu yüzden derlemeye bu klasörden başlıyor ve asıl
// package.json'ı bulamıyor. Bu betik asıl projeyi depo kökünde kurup derler ve
// çıktıyı Hostinger'ın beklediği yere (`.bolt/dist`) kopyalar.
//
// Kök dizin ayarı panelde sonradan değiştirilemiyor. Uygulama, kök dizin boş
// (ya da `/`) olacak şekilde yeniden içe aktarılırsa bu klasör hiç kullanılmaz;
// Hostinger doğrudan depo kökündeki package.json ile derler.

import { execSync } from 'node:child_process';
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // <depo>/.bolt
const root = resolve(here, '..'); // <depo>
const INSTALL_FLAGS = '--include=dev --include=optional --no-audit --no-fund';

function log(message) {
  console.log(`[rango] ${message}`);
}

function fail(message) {
  console.error(`[rango] HATA: ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

// Komutlar depo kökünde çalışır; npm projeyi çalışma dizininden bulur.
function tryNpm(command, extraEnv = {}) {
  log(`npm ${command}  (dizin: ${root})`);
  try {
    execSync(`npm ${command}`, { cwd: root, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
    return true;
  } catch (error) {
    log(`"npm ${command}" başarısız oldu (çıkış kodu ${error.status ?? 'bilinmiyor'}).`);
    return false;
  }
}

function npmRun(command, extraEnv = {}) {
  if (!tryNpm(command, extraEnv)) fail(`"npm ${command}" başarısız oldu.`);
}

// Tanı bilgisi; derleme günlüğünde görünür. Gizli değer yazılmaz.
let npmVersion = 'bilinmiyor';
try {
  npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
} catch {
  /* sürüm yalnızca bilgi amaçlı */
}
const outerTool = (process.env.npm_config_user_agent ?? '').split(' ')[0] || 'bilinmiyor';
log(`Node ${process.version}, npm ${npmVersion}, çağıran: ${outerTool}, NODE_ENV=${process.env.NODE_ENV ?? '(yok)'}`);
log(`Köprü klasörü: ${here}`);
log(`Depo kökü: ${root}`);

// 1) Üst klasörün gerçekten Rango deposu olduğundan emin ol; değilse hiçbir şeye dokunmadan dur.
const pkg = readJson(join(root, 'package.json'));
if (pkg?.name !== 'rango' || !pkg.scripts?.build || !pkg.devDependencies?.vite) {
  fail(
    `Depo kökünde Rango'nun package.json dosyası bulunamadı (${root}). ` +
      'Hostinger bu derlemede depoyu değil yalnızca .bolt klasörünü vermiş; köprü bu durumda çalışamaz. ' +
      'Kök dizin ayarı panelde sonradan değiştirilemiyor: Node.js uygulamasını GitHub\'dan yeniden içe aktarırken ' +
      '"Kök dizin" (Root directory) alanını boş bırakın ya da "/" yazın.',
  );
}
if (!existsSync(join(root, 'package-lock.json'))) {
  fail(`Depo kökünde package-lock.json yok (${root}). Bu dosyayı package.json ile birlikte GitHub'a gönderin.`);
}

// 2) Kur ve derle. Derleme araçları (vite, typescript, tailwind) devDependencies içinde;
//    Hostinger kurulumu NODE_ENV=production ile çalıştırsa bile onları da kur. Kilit dosyası
//    package.json ile uyuşmazsa ya da eş bağımlılık çakışırsa Hostinger'ın kendi kurulumu gibi
//    npm install ve ardından --legacy-peer-deps ile yeniden dene.
if (!tryNpm(`ci ${INSTALL_FLAGS}`)) {
  log('npm install ile yeniden deneniyor.');
  if (!tryNpm(`install ${INSTALL_FLAGS}`)) {
    log('npm install --legacy-peer-deps ile yeniden deneniyor.');
    npmRun(`install ${INSTALL_FLAGS} --legacy-peer-deps`);
  }
}
npmRun('run build', { NODE_ENV: 'production' });

// 3) Çıktıyı denetle. Supabase adresi boş ya da bozuk kalırsa site açılışta boş sayfa verir.
//    vite.config.ts kullandığı adresi dist/.htaccess içindeki CSP'ye yazar (adres yoksa
//    "*.supabase.co"); aynı adres derlenen JavaScript dosyalarında da bulunmalı.
const built = join(root, 'dist');
const target = join(here, 'dist');
if (!existsSync(join(built, 'index.html'))) {
  fail(`Derleme çıktısı bulunamadı: ${join(built, 'index.html')}`);
}
const htaccessFile = join(built, '.htaccess');
const host = existsSync(htaccessFile)
  ? readFileSync(htaccessFile, 'utf8').match(/connect-src 'self' https:\/\/([^\s;"]+)/)?.[1]
  : undefined;
if (!existsSync(htaccessFile)) {
  log('UYARI: dist/.htaccess yok; Supabase adresi denetimi atlandı.');
} else if (!host) {
  log("UYARI: dist/.htaccess içinde \"connect-src 'self' https://...\" bulunamadı; Supabase adresi denetimi atlandı.");
} else {
  const assets = join(built, 'assets');
  const bundles = existsSync(assets) ? readdirSync(assets).filter((name) => name.endsWith('.js')) : [];
  const inBundle = bundles.some((name) =>
    readFileSync(join(assets, name), 'utf8').toLowerCase().includes(`https://${host}`),
  );
  if (host.includes('*') || !inBundle) {
    fail(
      'Supabase adresi derlenen JavaScript dosyalarında bulunamadı: VITE_SUPABASE_URL boş ya da geçersiz ' +
        '(https://<proje>.supabase.co biçiminde olmalı). .env, Hostinger ortam değişkenleri ya da ' +
        'vite.config.ts içindeki varsayılanı kontrol edin.',
    );
  }
  log(`Supabase adresi derlenen dosyalarda: https://${host}`);
}

// 4) Çıktıyı Hostinger'ın beklediği yere kopyala (.htaccess dahil).
rmSync(target, { recursive: true, force: true });
cpSync(built, target, { recursive: true });
if (!existsSync(join(target, 'index.html'))) {
  fail(`Çıktı kopyalanamadı: ${target}`);
}
log(`Çıktı kopyalandı: ${built} -> ${target}`);

// 5) Hostinger'ın güvenlik taraması yalnızca .bolt klasörünü (bağımlılık yok) görür; gerçek
//    bağımlılıkların özetini günlüğe yaz. Yalnızca bilgi amaçlıdır, derlemeyi durdurmaz.
log('Güvenlik özeti (npm audit, yalnızca bilgi; derlemeyi durdurmaz):');
try {
  execSync('npm audit --omit=dev', { cwd: root, stdio: 'inherit', timeout: 120_000 });
} catch {
  /* açık bulunması ya da ağ hatası derlemeyi etkilemez */
}
