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
 * Bu anahtar Supabase'in eski (legacy) anon anahtarıdır; Supabase'e göre 2026
 * sonunda çalışmayı bırakır. Yeni sb_publishable_ anahtarına geçerken Bolt'taki
 * .env ile birlikte burayı da güncelleyin. Buraya ASLA service_role / sb_secret_
 * anahtarı koymayın (aşağıdaki denetim derlemeyi durdurur).
 */
const SUPABASE_DEFAULTS = {
  url: 'https://ocgqkdhrmjesrbksnrlh.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9jZ3FrZGhybWplc3Jia3NucmxoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4ODYyNDksImV4cCI6MjEwOTQ2MjI0OX0.RWvi05iVL0XqwVANnQ8t-RlD4MVQ_iZxeLsqJDwflxU',
};

interface SupabaseSettings {
  url: string;
  key: string;
  source: string;
}

/**
 * Adres ve anahtar her zaman birlikte, şu sırayla alınır:
 * 1. .env dosyaları ya da VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY ortam değişkenleri (Bolt, Hostinger paneli),
 * 2. Hostinger'ın "Veritabanı bağla → Supabase" sihirbazının yazdığı SUPABASE_URL + SUPABASE_ANON_KEY,
 * 3. SUPABASE_DEFAULTS.
 * Yalnızca biri verilmişse derleme durur; yoksa iki farklı projenin değerleri karışırdı.
 */
function resolveSupabase(env: Record<string, string>): SupabaseSettings {
  const pair = (url: string | undefined, key: string | undefined, source: string) => {
    const u = url?.trim();
    const k = key?.trim();
    if (!u && !k) return null;
    if (!u || !k) {
      throw new Error(`[rango] ${source}: Supabase adresi ve anahtarı birlikte verilmeli (${u ? 'anahtar' : 'adres'} eksik).`);
    }
    return { url: u, key: k, source };
  };
  return (
    pair(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY') ??
    pair(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, 'SUPABASE_URL / SUPABASE_ANON_KEY') ?? {
      ...SUPABASE_DEFAULTS,
      source: 'vite.config.ts içindeki varsayılan',
    }
  );
}

/** Anahtar bir JWT ise içindeki rol ve proje bilgisini döndürür; değilse (ör. sb_publishable_) null. */
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

/** Tarayıcıya gidecek anahtarın herkese açık olduğunu ve adresle aynı projeye ait olduğunu denetler. */
function assertPublicSupabase({ url, key, source }: SupabaseSettings): void {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error(parsed.protocol);
    host = parsed.hostname;
  } catch {
    throw new Error(`[rango] ${source}: Supabase adresi geçersiz ("${url}"); https://<proje>.supabase.co biçiminde olmalı.`);
  }
  if (key.startsWith('sb_secret_')) {
    throw new Error(`[rango] ${source}: gizli (sb_secret_) anahtar tarayıcıya giden koda konamaz; anon ya da sb_publishable_ anahtarını kullanın.`);
  }
  const claims = jwtClaims(key);
  if (!claims) return; // JWT değil (ör. sb_publishable_)
  if (claims.role !== undefined && claims.role !== 'anon') {
    throw new Error(`[rango] ${source}: anahtarın rolü "${String(claims.role)}"; tarayıcıya yalnızca anon anahtarı konabilir.`);
  }
  const project = host.endsWith('.supabase.co') ? host.split('.')[0] : undefined;
  if (typeof claims.ref === 'string' && project && claims.ref !== project) {
    throw new Error(`[rango] ${source}: anahtar "${claims.ref}" projesine, adres "${project}" projesine ait; ikisi aynı projeden olmalı.`);
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const supabase = resolveSupabase(env);
  assertPublicSupabase(supabase);
  if (!supabase.source.startsWith('VITE_')) {
    console.info(`[rango] Supabase ayarları: ${supabase.source}`);
  }
  return {
    // Uygulama bu iki değeri her zaman yukarıda çözümlenen çiftten alır.
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(supabase.url),
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
