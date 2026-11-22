/**
 * Puts a captured app screen into the store frame (backdrop + headline + phone) and renders the
 * final picture. The capture is placed pixel for pixel, so the app's text stays as sharp as it is
 * on a real phone.
 */
import { writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));

/** The phone the app is shown on: a 393-point-wide Android screen with a 36-point status bar. */
export const DEVICE = { width: 393, statusBar: 36 };

/** Design units: every frame is drawn 1080 wide and scaled to the requested picture width. */
const UNIT = 1080;
/** Width of the phone's frame around the screen, in design units (--bezel in frame.css). */
const BEZEL = 15;
/** Height of the app's bottom tab bar (CustomerLayout). */
const TAB_BAR = 60;

/**
 * The phone runs off the bottom of the picture. The app area is made just tall enough for the tab
 * bar to start right below the cut, so a bar pinned above it (such as "Randevu Al") is the last
 * thing in view instead of being sliced in half.
 */
export function layoutFor({ canvas, screenWidth, phoneTop }) {
  const canvasScale = canvas.width / UNIT;
  const canvasHeight = Math.round(canvas.height / canvasScale);
  const s = screenWidth / DEVICE.width;
  const visibleApp = (canvasHeight - phoneTop - BEZEL) / s - DEVICE.statusBar;
  return {
    canvasScale,
    canvasHeight,
    s,
    screenWidth,
    phoneTop,
    appHeight: Math.ceil(visibleApp) + TAB_BAR + 1,
    // Capturing at this scale makes one capture pixel equal one pixel of the final picture.
    captureScale: (screenWidth * canvasScale + 0.01) / DEVICE.width,
  };
}

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
/** *word* in a headline is set in gold. */
const headline = (text) => escape(text).replace(/\*(.+?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');

/** Wi-Fi, mobile signal and battery (Material Symbols outlines). */
const STATUS_ICONS = `
  <svg viewBox="0 0 24 24"><path d="M12.01 21.49 23.64 7c-.45-.34-4.93-4-11.64-4C5.28 3 .81 6.66.36 7l11.63 14.49.01.01.01-.01z"/></svg>
  <svg viewBox="0 0 24 24"><path d="M2 22h20V2z"/></svg>
  <svg viewBox="0 0 24 24"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z"/></svg>`;

/** frame: { eyebrow | wordmark, title, sub, theme, flip, clock } */
function html(frame, layout, capturePath) {
  const vars = `--canvas-h:${layout.canvasHeight}px;--screen-w:${layout.screenWidth}px;--phone-top:${layout.phoneTop}px;--s:${layout.s};--status-bar:${DEVICE.statusBar}px`;
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(join(here, 'frame.css'))}"></head>
<body class="${frame.flip ? 'flip' : ''}" style="${vars}">
  <div class="rings"><i class="ring a"></i><i class="ring b"></i><i class="ring c"></i></div>
  <div class="copy">
    ${frame.wordmark ? '<p class="wordmark">Rango<span>.</span></p>' : `<p class="eyebrow">${escape(frame.eyebrow)}</p>`}
    <h1 class="title">${headline(frame.title)}</h1>
    <p class="sub">${escape(frame.sub)}</p>
  </div>
  <div class="phone${frame.theme === 'dark' ? ' dark' : ''}">
    <div class="screen">
      <div class="statusbar"><span>${frame.clock}</span><span class="icons">${STATUS_ICONS}</span></div>
      <i class="camera"></i>
      <img class="app" src="${pathToFileURL(capturePath)}" alt="">
    </div>
  </div>
</body></html>`;
}

export async function openComposer({ canvas, workDir }) {
  const browser = await chromium.launch();

  async function compose(frame, layout, capture, outFile) {
    const capturePath = join(workDir, `${frame.id}.capture.png`);
    const pagePath = join(workDir, `${frame.id}.html`);
    await writeFile(capturePath, capture);
    await writeFile(pagePath, html(frame, layout, capturePath));
    const context = await browser.newContext({ viewport: { width: UNIT, height: layout.canvasHeight }, deviceScaleFactor: layout.canvasScale });
    const page = await context.newPage();
    await page.goto(pathToFileURL(pagePath).href);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0));
    const shown = await page.locator('.app').evaluate((img) => [img.naturalWidth, Math.round(img.getBoundingClientRect().width * window.devicePixelRatio)]);
    if (shown[0] !== shown[1]) throw new Error(`${frame.id}: ekran görüntüsü ${shown[0]} px, çerçevedeki yeri ${shown[1]} px (bulanık çıkar).`);
    // An opaque page gives a PNG without transparency, as Google Play asks for.
    await page.screenshot({ path: outFile, type: 'png' });
    await context.close();
    await rm(pagePath);
    await rm(capturePath);
  }

  return { compose, close: () => browser.close() };
}
