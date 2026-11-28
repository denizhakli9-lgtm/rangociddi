import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isNative } from '@/lib/platform';

const SITE_HOSTS = ['rango.com.tr', 'www.rango.com.tr'];

/** Status bar follows the app's light/dark theme. */
async function syncStatusBar() {
  const dark = document.documentElement.dataset.theme === 'dark';
  try {
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    // On iOS the background colour is only visible when overlaysWebView is false (it is true here).
    await StatusBar.setBackgroundColor({ color: dark ? '#080808' : '#f8f7f3' });
  } catch {
    /* not available on this platform */
  }
}

/**
 * iOS resets the status bar to its default style whenever the app's screen re-appears after a
 * full-screen sheet (in-app browser, PayTR, camera), which can make the clock unreadable on the
 * light theme. JS gets no event for that moment, so the style is applied again once the closing
 * animation is over (twice, in case the animation runs long).
 */
export function resyncStatusBarSoon() {
  if (!isNative) return;
  // Right away too, so a dark-theme user sees the light-text bar again as early as possible.
  void syncStatusBar();
  setTimeout(() => void syncStatusBar(), 400);
  setTimeout(() => void syncStatusBar(), 1000);
}

/** Closes the in-app browser sheet, if one is open, and restores the status bar afterwards. */
export async function closeInAppBrowser(): Promise<void> {
  if (!isNative) return;
  try {
    await Browser.close();
  } catch {
    /* no sheet was open */
  }
  resyncStatusBarSoon();
}

/** Moves the in-app router to `path` without reloading the app. */
function goTo(path: string) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/**
 * Native glue for the Android / iOS app. Does nothing on the website.
 * Called once from main.tsx before React renders.
 */
export function initNative() {
  if (!isNative) return;

  void syncStatusBar();
  window.addEventListener('rango:theme', () => void syncStatusBar());
  // The native screen re-appears: in-app browser closed by the user ("Bitti" / swipe down), app back
  // from the background, photo/camera picker closed (a picked file or a cancel).
  void Browser.addListener('browserFinished', resyncStatusBarSoon);
  void App.addListener('resume', resyncStatusBarSoon);
  const onFilePicker = (e: Event) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'file') resyncStatusBarSoon();
  };
  document.addEventListener('change', onFilePicker, true);
  document.addEventListener('cancel', onFilePicker, true);

  // Android hardware/gesture back: go back inside the app, leave it only from the first screen.
  void App.addListener('backButton', ({ canGoBack }) => {
    // An open modal closes first (Modal listens for Escape).
    const modal = document.querySelector('[role="dialog"]');
    if (modal) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (canGoBack && (window.history.state?.idx ?? 0) > 0) window.history.back();
    else void App.exitApp();
  });

  // Links to rango.com.tr opened from e-mail, WhatsApp etc. (App Links / Universal Links,
  // see MOBIL-REHBERI.md) open the matching page inside the app.
  void App.addListener('appUrlOpen', ({ url }) => {
    try {
      const u = new URL(url);
      if (!SITE_HOSTS.includes(u.hostname)) return;
      // PayTR's return page (see paytr-token): close the payment sheet and show the booking's payment screen.
      if (u.pathname === '/odeme-sonuc.html') {
        const id = u.searchParams.get('randevu') ?? '';
        void closeInAppBrowser();
        if (/^[0-9a-f-]{36}$/i.test(id)) goTo(`/odeme/${id}?paytr=${u.searchParams.get('durum') === 'ok' ? 'ok' : 'hata'}`);
        return;
      }
      const path = u.pathname + u.search + u.hash;
      // Auth links (password reset, e-mail confirmation) carry tokens that Supabase only reads
      // when the app starts, so those reload the app at that address; others just navigate.
      if (/access_token=|refresh_token=|type=recovery|error_code=/.test(u.hash) || /[?&](code|token_hash)=/.test(u.search)) {
        window.location.replace(path);
      } else {
        goTo(path);
      }
    } catch {
      /* not a URL we handle */
    }
  });

  // Hide the launch screen once the first frame is drawn.
  requestAnimationFrame(() => void SplashScreen.hide({ fadeOutDuration: 200 }));
}
