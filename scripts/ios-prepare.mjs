#!/usr/bin/env node
/**
 * Prepares the iOS project for a build (MOBIL-REHBERI.md, iOS section). Run on the Mac after `npm run build`
 * (`npm run ios` does both and opens Xcode):
 *
 *   node scripts/ios-prepare.mjs
 *
 * Unlike android/, ios/ is kept in git: Xcode stores the signing team there. Every step below is
 * idempotent, so it is safe to run before each build, and it also repairs a freshly re-created ios/.
 *
 * 1. Creates ios/ with Capacitor if it does not exist yet, then syncs dist/ and the plugins.
 * 2. Generates the app icon and launch screen from assets/ (icon.png, splash.png, splash-dark.png).
 * 3. Writes the Info.plist keys App Review checks: permission texts (location, camera, photos),
 *    export compliance (HTTPS only), Turkish as the development language, portrait-only iPhone.
 *    Also turns on the iOS edge swipe for going back (SceneDelegate.swift).
 * 4. Adds the app's privacy manifest (PrivacyInfo.xcprivacy) to the Xcode project.
 * 5. Build settings: iPhone only, version / build number from IOS_VERSION / IOS_BUILD_NUMBER,
 *    signing team from IOS_TEAM_ID (all optional; Xcode keeps whatever was set there before).
 *    App Store Connect only accepts a build number higher than every one uploaded for that version.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync, unlinkSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const fail = (msg) => {
  console.error(`[ios] ${msg}`);
  process.exit(1);
};

if (!existsSync('dist/index.html')) fail('dist/ yok: önce "npm run build" çalıştırın.');

if (!existsSync('ios/App/App.xcodeproj')) run('npx cap add ios');
run('npx cap sync ios');

run(
  "npx --yes @capacitor/assets@3 generate --ios --assetPath assets --iconBackgroundColor '#080808' --iconBackgroundColorDark '#080808' --splashBackgroundColor '#f8f7f3' --splashBackgroundColorDark '#080808'",
);

// The Capacitor template's own splash images stay next to the generated ones; Xcode warns about
// files an asset catalog does not reference, so drop them.
for (const set of ['AppIcon.appiconset', 'Splash.imageset']) {
  const dir = `ios/App/App/Assets.xcassets/${set}`;
  const used = new Set(JSON.parse(readFileSync(`${dir}/Contents.json`, 'utf8')).images.map((i) => i.filename));
  for (const f of readdirSync(dir)) if (f.endsWith('.png') && !used.has(f)) unlinkSync(`${dir}/${f}`);
}

// ---------------------------------------------------------------- Info.plist
const plistPath = 'ios/App/App/Info.plist';
let plist = readFileSync(plistPath, 'utf8');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const str = (s) => `<string>${esc(s)}</string>`;
const arr = (items) => `<array>\n${items.map((i) => `\t\t${str(i)}`).join('\n')}\n\t</array>`;

/** Sets a top-level key (string, bool or string array) in Info.plist, replacing any existing value. */
function setKey(key, valueXml) {
  const existing = new RegExp(
    `(\\n[ \\t]*<key>${key}</key>\\s*)(<string>[^<]*</string>|<true/>|<false/>|<array>[\\s\\S]*?</array>)`,
  );
  if (existing.test(plist)) {
    plist = plist.replace(existing, (_, head) => `${head}${valueXml}`);
  } else {
    const end = plist.lastIndexOf('</dict>');
    plist = `${plist.slice(0, end)}\t<key>${key}</key>\n\t${valueXml}\n${plist.slice(end)}`;
  }
}

const LOCATION_TEXT =
  'Konumunuz yalnızca siz istediğinizde kullanılır: müşteriler için size en yakın kuaför, berber ve güzellik salonlarını listelemek, işletme sahipleri için salonun haritadaki yerini işaretlemek. Örnek: "Konumumu kullan" düğmesine bastığınızda yakınınızdaki salonlar mesafeye göre sıralanır.';

const PLIST = {
  // Turkish first: system texts (permission buttons, the in-app browser's "Done") follow the phone's
  // language, and the app ships Turkish and English.
  CFBundleDevelopmentRegion: str('tr'),
  CFBundleLocalizations: arr(['tr', 'en']),
  // Permission texts the user sees; App Review rejects vague ones (guideline 5.1.1).
  // Without the location text iOS silently ignores the request and "Konumumu kullan" never answers.
  NSLocationWhenInUseUsageDescription: str(LOCATION_TEXT),
  // Never shown (the app only asks "while using"), but @capacitor/geolocation links a library that can
  // track in the background, so Apple's upload check asks for it (plugin README; ITMS-90683).
  NSLocationAlwaysAndWhenInUseUsageDescription: str(LOCATION_TEXT),
  // Image inputs offer "Take Photo": without this text iOS closes the app.
  NSCameraUsageDescription: str(
    'İşletme sahipleri salon, logo ve çalışan fotoğrafını kamerayla çekip işletme sayfasına ekleyebilir. Örnek: "Fotoğraf Çek" ile salonunuzun iç mekânını çekip galeriye eklemek.',
  ),
  NSPhotoLibraryUsageDescription: str(
    'İşletme sahipleri salon, logo ve çalışan fotoğraflarını galeriden seçip işletme sayfasına ekleyebilir. Örnek: salonunuzun kapak fotoğrafını seçmek.',
  ),
  NSPhotoLibraryAddUsageDescription: str(
    'Uzun basıp "Fotoğraflara Ekle"yi seçtiğiniz görseller fotoğraf arşivinize kaydedilir. Örnek: beğendiğiniz bir saç modelinin fotoğrafını kaydetmek.',
  ),
  // The app only uses standard HTTPS (exempt encryption): no export compliance questions on every upload.
  ITSAppUsesNonExemptEncryption: '<false/>',
  // The layout is built for portrait phones.
  UISupportedInterfaceOrientations: arr(['UIInterfaceOrientationPortrait']),
  UIRequiredDeviceCapabilities: arr(['arm64']),
};
for (const [key, value] of Object.entries(PLIST)) setKey(key, value);
writeFileSync(plistPath, plist);

// ---------------------------------------------------------------- Swipe back
// The edge swipe for going back (WKWebView turns it off) comes from a small CAPBridgeViewController
// subclass kept in SceneDelegate.swift, so no new file has to be added to the Xcode project.
// The Capacitor template creates SceneDelegate.swift without it.
const sceneDelegatePath = 'ios/App/App/SceneDelegate.swift';
if (existsSync(sceneDelegatePath)) {
  let scene = readFileSync(sceneDelegatePath, 'utf8');
  if (!scene.includes('class RangoBridgeViewController')) {
    const rootLine = 'window?.rootViewController = CAPBridgeViewController()';
    if (!scene.includes(rootLine) || !scene.includes('class SceneDelegate')) {
      console.warn('[ios] SceneDelegate.swift beklenen biçimde değil: geri kaydırma hareketi eklenmedi.');
    } else {
      const subclass = [
        '/// Capacitor\'s view controller with the iOS edge swipe for going back (WKWebView turns it off by default).',
        '/// Added by scripts/ios-prepare.mjs.',
        'class RangoBridgeViewController: CAPBridgeViewController {',
        '    override func capacitorDidLoad() {',
        '        super.capacitorDidLoad()',
        '        webView?.allowsBackForwardNavigationGestures = true',
        '    }',
        '}',
        '',
        '',
      ].join('\n');
      scene = scene
        .replace(rootLine, 'window?.rootViewController = RangoBridgeViewController()')
        .replace('class SceneDelegate', `${subclass}class SceneDelegate`);
      writeFileSync(sceneDelegatePath, scene);
    }
  }
} else {
  console.warn('[ios] SceneDelegate.swift yok: geri kaydırma hareketi eklenmedi.');
}

// ---------------------------------------------------------------- Privacy manifest
const pbxPath = 'ios/App/App.xcodeproj/project.pbxproj';
let pbx = readFileSync(pbxPath, 'utf8');

const manifestTarget = 'ios/App/App/PrivacyInfo.xcprivacy';
copyFileSync('scripts/ios/PrivacyInfo.xcprivacy', manifestTarget);

// Fixed ids so re-running never adds the file twice (Xcode only needs them unique in this project).
const FILE_REF = 'A1B2C3D40000000000000001';
const BUILD_FILE = 'A1B2C3D40000000000000002';
if (!pbx.includes('PrivacyInfo.xcprivacy')) {
  const insertAfter = (marker, line) => {
    const i = pbx.indexOf(marker);
    if (i < 0) fail(`project.pbxproj beklenen biçimde değil (${marker} yok).`);
    pbx = `${pbx.slice(0, i + marker.length)}\n${line}${pbx.slice(i + marker.length)}`;
  };
  insertAfter(
    '/* Begin PBXBuildFile section */',
    `\t\t${BUILD_FILE} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${FILE_REF} /* PrivacyInfo.xcprivacy */; };`,
  );
  insertAfter(
    '/* Begin PBXFileReference section */',
    `\t\t${FILE_REF} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };`,
  );
  // App group (the one holding Info.plist) and the Resources build phase.
  const group = pbx.match(/\/\* App \*\/ = \{\s*isa = PBXGroup;\s*children = \(/);
  if (!group) fail('project.pbxproj: App grubu bulunamadı.');
  insertAfter(group[0], `\t\t\t\t${FILE_REF} /* PrivacyInfo.xcprivacy */,`);
  const resources = pbx.match(/\/\* Resources \*\/ = \{\s*isa = PBXResourcesBuildPhase;\s*buildActionMask = \d+;\s*files = \(/);
  if (!resources) fail('project.pbxproj: Resources aşaması bulunamadı.');
  insertAfter(resources[0], `\t\t\t\t${BUILD_FILE} /* PrivacyInfo.xcprivacy in Resources */,`);
}

// ---------------------------------------------------------------- Build settings
/** Sets a build setting in every build configuration of the app target (the ones with a bundle id). */
function setSetting(name, value) {
  pbx = pbx.replace(/buildSettings = \{([\s\S]*?)\n(\t+)\};/g, (block, body, indent) => {
    if (!body.includes('PRODUCT_BUNDLE_IDENTIFIER')) return block;
    const line = new RegExp(`\\n\\t+${name} = [^;]*;`);
    const entry = `\n${indent}\t${name} = ${value};`;
    return line.test(body)
      ? block.replace(line, entry)
      : `buildSettings = {${body}${entry}\n${indent}};`;
  });
}

setSetting('TARGETED_DEVICE_FAMILY', '1');
setSetting('SUPPORTS_MACCATALYST', 'NO');
setSetting('SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD', 'NO');
setSetting('SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD', 'NO');

const version = process.env.IOS_VERSION;
const build = process.env.IOS_BUILD_NUMBER;
const team = process.env.IOS_TEAM_ID;
if (version) {
  if (!/^\d+(\.\d+){0,2}$/.test(version)) fail(`Geçersiz IOS_VERSION: ${version} (ör. 1.0.1)`);
  setSetting('MARKETING_VERSION', version);
}
if (build) {
  if (!/^\d+(\.\d+){0,2}$/.test(build)) fail(`Geçersiz IOS_BUILD_NUMBER: ${build} (ör. 7)`);
  setSetting('CURRENT_PROJECT_VERSION', build);
}
if (team) {
  if (!/^[A-Z0-9]{10}$/.test(team)) fail(`Geçersiz IOS_TEAM_ID: ${team} (10 karakter, ör. AB12CD34EF)`);
  setSetting('DEVELOPMENT_TEAM', team);
}
writeFileSync(pbxPath, pbx);

const v = pbx.match(/MARKETING_VERSION = ([^;]*);/)?.[1];
const b = pbx.match(/CURRENT_PROJECT_VERSION = ([^;]*);/)?.[1];
const t = pbx.match(/DEVELOPMENT_TEAM = ([^;]*);/)?.[1];
console.log(`[ios] Hazır: tr.com.rango.app, sürüm ${v} (${b})${t ? `, ekip ${t}` : ', ekip: Xcode > Signing & Capabilities'}`);
