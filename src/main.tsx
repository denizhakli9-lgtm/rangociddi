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
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import './index.css';
import { nextVisitSlogan } from '@/lib/brand';
import { initNative } from '@/lib/native';
import { captureReferralFromUrl } from '@/lib/fieldAgent';

initNative();
// A field agent's link (?ref=CODE) is kept until the business sign-up form uses it.
captureReferralFromUrl();

const visitSlogan = nextVisitSlogan();

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
