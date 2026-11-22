/**
 * Opens the built app (dist/) in a phone-sized browser with the sample content and takes
 * screenshots of real screens. Used by run.mjs.
 */
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { installMockApi, storageEntries } from './mock-api.mjs';
import { NOW, buildData } from './sample-data.mjs';

// Playwright is not a dependency of the app; require() also finds a globally installed copy.
const { chromium } = createRequire(import.meta.url)('playwright');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
};

/** Serves dist/ like the hosting does: real files as they are, every other path gets index.html. */
async function serveDist(distDir) {
  const index = await readFile(join(distDir, 'index.html'));
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    try {
      if (!extname(path)) throw new Error('route');
      const body = await readFile(join(distDir, path));
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(200, { 'content-type': TYPES['.html'] }).end(index);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://localhost:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** The backend address is compiled into the bundle; reading it from there keeps this in step with vite.config.ts. */
async function supabaseOriginOf(distDir) {
  for (const file of await readdir(join(distDir, 'assets'))) {
    if (!/^index-.*\.js$/.test(file)) continue;
    const match = (await readFile(join(distDir, 'assets', file), 'utf8')).match(/https:\/\/[a-z0-9]+\.supabase\.co/);
    if (match) return match[0];
  }
  throw new Error('dist/ içinde Supabase adresi bulunamadı. Önce "npm run build" çalıştırın.');
}

async function cookieVersionOf(rootDir) {
  const source = await readFile(join(rootDir, 'src/lib/legal.ts'), 'utf8');
  return source.match(/cookies:\s*'([^']+)'/)?.[1] ?? '';
}

/** Waits until the screen has stopped loading: data, fonts, and every picture in view. */
async function settle(page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !document.querySelector('.skeleton, .animate-spin'));
  await page.waitForFunction(() =>
    Array.from(document.images).every((img) => {
      const r = img.getBoundingClientRect();
      const visible = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      return !visible || (img.complete && img.naturalWidth > 0);
    }),
  );
  await page.waitForTimeout(300);
}

export async function openApp(rootDir) {
  const distDir = join(rootDir, 'dist');
  const server = await serveDist(distDir);
  const supabaseOrigin = await supabaseOriginOf(distDir);
  const cookieVersion = await cookieVersionOf(rootDir);
  const data = buildData(supabaseOrigin);

  /**
   * screen: { path, theme?, prepare?(page) }
   * device: { width, height, scale } in CSS pixels; the picture is width*scale wide.
   */
  async function capture(screen, device) {
    // The pixel density is given to the browser itself rather than emulated per page: with an
    // emulated density, headless Chromium draws the app's frosted bars (backdrop-blur) without
    // the blur, and whatever has scrolled under the header shows through.
    const browser = await chromium.launch({
      args: [`--force-device-scale-factor=${device.scale}`, `--window-size=${device.width},${device.height}`],
    });
    try {
      const context = await browser.newContext({
        viewport: null,
        locale: 'tr-TR',
        timezoneId: 'Europe/Istanbul',
        // The app shortens its animations for this setting, so every capture shows the finished state.
        reducedMotion: 'reduce',
      });
      await installMockApi(context, { supabaseOrigin, data, publicDir: join(rootDir, 'public') });
      await context.addInitScript((entries) => {
        try {
          for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
        } catch { /* about:blank */ }
      }, storageEntries({ supabaseOrigin, cookieVersion, theme: screen.theme }));
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', (error) => problems.push(String(error)));
      page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
      await page.clock.setFixedTime(new Date(NOW));
      await page.goto(server.url + screen.path);
      await settle(page);
      const size = await page.evaluate(() => [window.innerWidth, window.innerHeight]);
      if (size[0] !== device.width || size[1] !== device.height) {
        throw new Error(`Ekran boyutu ${size.join('×')} oldu, ${device.width}×${device.height} bekleniyordu.`);
      }
      if (screen.prepare) {
        await screen.prepare(page);
        await settle(page);
      }
      const image = await page.screenshot({ type: 'png' });
      if (problems.length) console.warn(`[${screen.path}] tarayıcı uyarıları:\n  ${problems.join('\n  ')}`);
      return image;
    } finally {
      await browser.close();
    }
  }

  return { capture, data, close: () => server.close() };
}
