import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * Writes the project's own Supabase host into dist/.htaccess so the
 * Content-Security-Policy allows exactly this backend (not every *.supabase.co).
 */
function supabaseCsp(supabaseUrl: string | undefined): Plugin {
  let outDir = 'dist';
  return {
    name: 'rango-supabase-csp',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const file = resolve(outDir, '.htaccess');
      if (!existsSync(file)) return;
      let host = '*.supabase.co';
      try {
        if (supabaseUrl) host = new URL(supabaseUrl).host;
      } catch {
        /* keep the safe-but-broad fallback */
      }
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__SUPABASE_HOST__', host));
    },
  };
}

/**
 * Supabase istemci ayarlarının yedeği. Bunlar gizli değildir: tarayıcıya giden
 * JavaScript'e zaten gömülürler ve veritabanı Row Level Security ile korunur.
 * Git ile dağıtımda .env depoya girmez; bu yedek olmasa site boş sayfa verirdi.
 *
 * Anahtar, projenin "default" adlı yayınlanabilir (sb_publishable_) anahtarıdır
 * (Supabase → Settings → API Keys). Eski (legacy) JWT tabanlı anon anahtarı
 * kullanılmaz; Supabase eski anahtarları 2026 sonunda kaldırıyor. Buraya ASLA
 * sb_secret_ / service_role anahtarı koymayın (aşağıdaki denetim derlemeyi durdurur).
 */
const SUPABASE_DEFAULTS = {
  url: 'https://ocgqkdhrmjesrbksnrlh.supabase.co',
  key: 'sb_publishable_4XWej0uOwOHjYXDwXYB7AQ_e2b8xLXr',
};

interface SupabaseSettings {
  url: string;
  key: string;
  source: string;
}

/**
 * Adres ve anahtar her zaman birlikte, şu sırayla alınır:
 * 1. .env dosyaları ya da ortam değişkenleri (Bolt, Hostinger paneli): VITE_SUPABASE_URL +
 *    VITE_SUPABASE_PUBLISHABLE_KEY. Eski ad VITE_SUPABASE_ANON_KEY de okunur; ikisi birden varsa yenisi kullanılır.
 * 2. Hostinger'ın "Veritabanı bağla → Supabase" sihirbazının yazdığı SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY
 *    (ya da eski ad SUPABASE_ANON_KEY),
 * 3. SUPABASE_DEFAULTS.
 * Yalnızca biri verilmişse derleme durur; yoksa iki farklı projenin değerleri karışırdı.
 */
function resolveSupabase(env: Record<string, string | undefined>): SupabaseSettings {
  const pair = (vars: Record<string, string | undefined>, urlName: string, keyNames: string[]) => {
    const u = vars[urlName]?.trim();
    const keyName = keyNames.find((name) => vars[name]?.trim()) ?? keyNames[0];
    const k = vars[keyName]?.trim();
    const source = `${urlName} / ${keyName}`;
    if (!u && !k) return null;
    if (!u || !k) {
      throw new Error(`[rango] ${source}: Supabase adresi ve anahtarı birlikte verilmeli (${u ? 'anahtar' : 'adres'} eksik).`);
    }
    return { url: u, key: k, source };
  };
  return (
    pair(env, 'VITE_SUPABASE_URL', ['VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_ANON_KEY']) ??
    pair(process.env, 'SUPABASE_URL', ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY']) ?? {
      ...SUPABASE_DEFAULTS,
      source: 'vite.config.ts içindeki varsayılan',
    }
  );
}

/** Anahtar bir JWT ise (eski anon / service_role anahtarları) içindeki rol ve projeyi döndürür; değilse (ör. sb_publishable_) null. */
function jwtClaims(key: string): { role?: unknown; ref?: unknown } | null {
  const [, payload, signature] = key.split('.');
  if (!payload || !signature) return null;
  try {
    const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return claims && typeof claims === 'object' ? claims : null;
  } catch {
    return null;
  }
}

/** https://<proje>.supabase.co adresindeki proje kimliği; başka biçimdeki adreslerde undefined. */
function projectRef(url: string): string | undefined {
  try {
    const host = new URL(url).hostname;
    return host.endsWith('.supabase.co') ? host.split('.')[0] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * .env'de, Bolt'ta ya da Hostinger panelinde Rango projesinin eski (legacy) anon anahtarı kalmışsa derleme durmaz:
 * aynı projenin SUPABASE_DEFAULTS içindeki yayınlanabilir anahtarı kullanılır ve uyarı yazılır. Böylece panellerdeki
 * eski değer güncellenmeden de yayınlanan site ve uygulama yalnızca sb_publishable_ anahtarını taşır. Başka bir
 * projenin eski anahtarı bu kurala girmez; assertPublicSupabase onu reddeder.
 */
function upgradeLegacyKey(settings: SupabaseSettings): SupabaseSettings {
  const claims = jwtClaims(settings.key);
  const ref = projectRef(settings.url);
  if (!claims || claims.role !== 'anon' || !ref || claims.ref !== ref || projectRef(SUPABASE_DEFAULTS.url) !== ref) {
    return settings;
  }
  console.warn(
    `[rango] UYARI: ${settings.source} içinde Supabase'in eski (legacy) anon anahtarı var; yerine projenin ` +
      `sb_publishable_ anahtarı (vite.config.ts) kullanıldı. Bu değeri sb_publishable_ anahtarıyla değiştirin ` +
      '(YAYINLAMA-REHBERI.md, "Supabase API anahtarı geçişi").',
  );
  return { url: settings.url, key: SUPABASE_DEFAULTS.key, source: settings.source };
}

/**
 * Tarayıcıya (ve mobil uygulamaya) gidecek anahtarın projenin yayınlanabilir (sb_publishable_) anahtarı olduğunu
 * denetler. Eski JWT tabanlı anon anahtarı da reddedilir: Supabase'te eski anahtarlar kapatılınca o anahtarla
 * derlenen site ve mağazadaki uygulama sürümleri hiçbir isteği tamamlayamaz.
 */
function assertPublicSupabase({ url, key, source }: SupabaseSettings): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(parsed.protocol);
  } catch {
    throw new Error(`[rango] ${source}: Supabase adresi geçersiz ("${url}"); https://<proje>.supabase.co biçiminde olmalı.`);
  }
  if (key.startsWith('sb_secret_')) {
    throw new Error(`[rango] ${source}: gizli (sb_secret_) anahtar tarayıcıya giden koda konamaz; sb_publishable_ anahtarını kullanın.`);
  }
  const claims = jwtClaims(key);
  if (claims && claims.role !== undefined && claims.role !== 'anon') {
    throw new Error(`[rango] ${source}: anahtarın rolü "${String(claims.role)}"; bu gizli bir anahtardır ve tarayıcıya giden koda konamaz. sb_publishable_ anahtarını kullanın.`);
  }
  if (claims) {
    throw new Error(
      `[rango] ${source}: bu, Supabase'in eski (legacy) JWT tabanlı anon anahtarı. Eski anahtarlar kapatılınca bu anahtarla ` +
        'derlenen site ve uygulama çalışmaz. Yerine projenin sb_publishable_ ile başlayan anahtarını yazın ' +
        '(Supabase → Settings → API Keys → Publishable key). Ayrıntı: YAYINLAMA-REHBERI.md, "Supabase API anahtarı geçişi".',
    );
  }
  if (!key.startsWith('sb_publishable_')) {
    throw new Error(`[rango] ${source}: anahtar tanınmadı; Supabase'in sb_publishable_ ile başlayan yayınlanabilir anahtarı olmalı (tırnak ya da boşluk kalmadığını kontrol edin).`);
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabase = upgradeLegacyKey(resolveSupabase(env));
  assertPublicSupabase(supabase);
  if (!supabase.source.startsWith('VITE_')) {
    console.info(`[rango] Supabase ayarları: ${supabase.source}`);
  }
  return {
    // Uygulama adresi ve anahtarı her zaman yukarıda çözümlenen çiftten alır. Eski ad da aynı anahtara bağlanır;
    // böylece .env'de kalmış eski bir VITE_SUPABASE_ANON_KEY değeri pakete hiçbir yoldan giremez.
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(supabase.key),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabase.key),
    },
    plugins: [react(), supabaseCsp(supabase.url)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});
