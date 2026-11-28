import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import { preloadRoute } from '@/lib/lazyPage';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AuthProvider } from '@/contexts/AuthContext';
import { LocationProvider } from '@/contexts/LocationContext';
import { ToastProvider } from '@/contexts/ToastContext';
// Fonts are bundled with the app instead of loaded from Google Fonts, so
// visitors' IP addresses are not sent to a third party abroad (KVKK md. 9).
import './fonts.css';
import './index.css';
import { Capacitor } from '@capacitor/core';
import { initNative } from '@/lib/native';
import { initKeyboardBars } from '@/lib/keyboard';
import { captureReferralFromUrl } from '@/lib/fieldAgent';

// iOS-app-only styles (16px form controls, no long-press callout) hang off this class, so the
// website and the Android app keep their design.
if (Capacitor.getPlatform() === 'ios') document.documentElement.classList.add('ios');
initNative();
initKeyboardBars();
// A field agent's link (?ref=CODE) is kept until the business sign-up form uses it.
captureReferralFromUrl();

// The brand line is fixed; it is the same sentence the static pages and the share image carry.
const visitSlogan = 0;

const container = document.getElementById('root')!;

function start() {
  createRoot(container).render(
    <StrictMode>
      <I18nProvider sloganIndex={visitSlogan}>
        <AuthProvider>
          <LocationProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </LocationProvider>
        </AuthProvider>
      </I18nProvider>
    </StrictMode>,
  );
}

// A page published as static HTML (seo/prerender.ts) is already on screen. Its code is loaded
// first, so the app replaces it in one step instead of flashing a loading spinner in between;
// if that takes unusually long the app starts anyway.
if (container.firstElementChild) {
  Promise.race([preloadRoute(window.location.pathname), new Promise<void>((resolve) => setTimeout(resolve, 4000))])
    .catch(() => undefined)
    .then(start);
} else {
  start();
}
