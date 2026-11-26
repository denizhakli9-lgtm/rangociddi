#!/usr/bin/env node
/**
 * Prepares the Android project for a build, the same way on any computer and on GitHub Actions
 * (.github/workflows/android.yml). Run after `npm run build`:
 *
 *   node scripts/android-prepare.mjs
 *
 * 1. Creates android/ with Capacitor if it does not exist yet (it is not kept in git), then syncs dist/.
 * 2. Generates the launcher icons and splash screens from assets/ (icon.png, splash.png, splash-dark.png).
 * 3. Adds the location permissions the "Konumumu kullan" button needs (MOBIL-REHBERI.md, section 2).
 * 4. Sets versionCode / versionName when ANDROID_VERSION_CODE / ANDROID_VERSION_NAME are given.
 *    Google Play only accepts a versionCode higher than every one uploaded before.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (!existsSync('dist/index.html')) {
  console.error('[android] dist/ yok: önce "npm run build" çalıştırın.');
  process.exit(1);
}

if (!existsSync('android')) run('npx cap add android');
run('npx cap sync android');

run(
  "npx --yes @capacitor/assets@3 generate --android --assetPath assets --iconBackgroundColor '#080808' --iconBackgroundColorDark '#080808' --splashBackgroundColor '#f8f7f3' --splashBackgroundColorDark '#080808'",
);

const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = readFileSync(manifestPath, 'utf8');
for (const perm of ['android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_FINE_LOCATION']) {
  if (!manifest.includes(perm)) manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${perm}" />\n</manifest>`);
}
writeFileSync(manifestPath, manifest);

const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf8');
const code = process.env.ANDROID_VERSION_CODE;
const name = process.env.ANDROID_VERSION_NAME;
if (code) {
  if (!/^\d+$/.test(code) || Number(code) > 2100000000) throw new Error(`Geçersiz ANDROID_VERSION_CODE: ${code}`);
  gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`);
}
if (name) gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${name.replace(/"/g, '')}"`);
writeFileSync(gradlePath, gradle);

const v = gradle.match(/versionCode\s+(\d+)/)?.[1];
const vn = gradle.match(/versionName\s+"([^"]*)"/)?.[1];
console.log(`[android] Hazır: tr.com.rango.app, versionCode ${v}, versionName ${vn}`);
