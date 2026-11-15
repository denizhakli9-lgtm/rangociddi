import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
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

const visitSlogan = nextVisitSlogan();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider slogan={visitSlogan}>
      <AuthProvider>
        <LocationProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </LocationProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>
);
