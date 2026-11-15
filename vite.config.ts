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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), supabaseCsp(env.VITE_SUPABASE_URL)],
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
