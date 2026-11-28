import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { CustomerLayout } from '@/components/layout/CustomerLayout';
import { ProfileLoadError, RequireAuth } from '@/components/layout/RequireAuth';
import { PageLoader } from '@/components/ui/Feedback';
import { ScrollToTop } from '@/components/ScrollToTop';
import { CookieNotice } from '@/components/legal/CookieNotice';
import { maintenanceActive } from '@/lib/maintenance';
import { isNative } from '@/lib/platform';
import { lazyPage } from '@/lib/lazyPage';
import { homePathFor, useAuth } from '@/contexts/AuthContext';
import { RouteSeo } from '@/lib/seo/useSeo';
import { CITIES } from '@/lib/seo/places';
import Splash from '@/pages/Splash';
import Login from '@/pages/auth/Login';
import Home from '@/pages/customer/Home';

const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const LocationSelect = lazy(() => import('@/pages/customer/LocationSelect'));
const SearchPage = lazyPage(() => import('@/pages/customer/Search'), /^\/ara\/?$/);
const Categories = lazyPage(() => import('@/pages/customer/Categories'), /^\/kategoriler\/?$/);
const BusinessDetail = lazyPage(() => import('@/pages/customer/BusinessDetail'), /^\/i\/[^/]+\/?$/);
const BookingWizard = lazy(() => import('@/pages/customer/booking/BookingWizard'));
const Payment = lazy(() => import('@/pages/customer/booking/Payment'));
const Confirmation = lazy(() => import('@/pages/customer/booking/Confirmation'));
const Appointments = lazy(() => import('@/pages/customer/Appointments'));
const Favorites = lazy(() => import('@/pages/customer/Favorites'));
const Profile = lazy(() => import('@/pages/customer/Profile'));
const SupportCenter = lazy(() => import('@/pages/support/SupportCenter'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const LegalPage = lazyPage(() => import('@/pages/legal/LegalPage'), /^\/yasal\//);
const Landing = lazyPage(() => import('@/pages/customer/Landing'), new RegExp(`^/(?:${CITIES.map((c) => c.slug).join('|')})(?:/|$)`));
const Faq = lazyPage(() => import('@/pages/Faq'), /^\/sss\/?$/);
const ForBusiness = lazyPage(() => import('@/pages/ForBusiness'), /^\/isletmeler-icin\/?$/);

const OwnerArea = lazy(() => import('@/pages/owner/OwnerArea'));
const AdminArea = lazy(() => import('@/pages/admin/AdminArea'));
const AdminSetup = lazy(() => import('@/pages/admin/AdminSetup'));
const FieldArea = lazy(() => import('@/pages/field/FieldArea'));
const Maintenance = lazy(() => import('@/pages/Maintenance'));

/** True when the site was opened through a password-recovery link (read before the auth client tidies the address). */
const OPENED_WITH_RECOVERY = /type=recovery/.test(window.location.hash);

/**
 * The website's home page. The mobile app starts with the splash screen and the welcome
 * slides; on the web "/" shows the home page itself, without a redirect, because it is the
 * address search engines index and most visitors land on.
 *
 * It is used for both "/" and "/kesfet", so moving between the two addresses keeps the page
 * mounted. What the old splash screen decided happens only when the site is opened at "/".
 */
function WebHome() {
  const location = useLocation();
  const { session, profile, loading } = useAuth();
  if (location.pathname === '/') {
    // `key` is "default" only for the address the site was opened with.
    if (OPENED_WITH_RECOVERY && location.key === 'default') return <Navigate to="/sifre-yenile" replace />;
    // Signed in, but the profile could not be read: offer retry / sign-out.
    if (!loading && session && !profile) return <ProfileLoadError />;
    // Business owners and admins continue to their own panel.
    if (!loading && profile && homePathFor(profile) !== '/kesfet') return <Navigate to={homePathFor(profile)} replace />;
  }
  return <Home />;
}

/** The website while maintenance mode is on: every page shows the notice, only the legal texts stay open. */
function MaintenanceRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <RouteSeo />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/yasal" element={<Navigate to="/yasal/aydinlatma-metni" replace />} />
          <Route
            path="/yasal/:slug"
            element={
              <div className="min-h-screen bg-ink">
                <header className="mx-auto max-w-6xl px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-6">
                  <Link to="/" className="font-display text-2xl font-semibold tracking-wide text-white">
                    Rango<span className="text-gold-500">.</span>
                  </Link>
                </header>
                <main className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
                  <LegalPage />
                </main>
              </div>
            }
          />
          <Route path="*" element={<Maintenance />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default function App() {
  if (maintenanceActive) return <MaintenanceRoutes />;

  return (
    <BrowserRouter>
      <ScrollToTop />
      <RouteSeo />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {isNative && <Route path="/" element={<Splash />} />}
          <Route path="/hosgeldin" element={<Onboarding />} />
          <Route path="/giris" element={<Login />} />
          <Route path="/kayit" element={<Register />} />
          <Route path="/sifremi-unuttum" element={<ForgotPassword />} />
          <Route path="/sifre-yenile" element={<ResetPassword />} />

          <Route element={<CustomerLayout />}>
            {!isNative && <Route path="/" element={<WebHome />} />}
            <Route path="/kesfet" element={isNative ? <Home /> : <WebHome />} />
            <Route path="/konum" element={<LocationSelect />} />
            <Route path="/ara" element={<SearchPage />} />
            <Route path="/kategoriler" element={<Categories />} />
            <Route path="/i/:slug" element={<BusinessDetail />} />
            <Route path="/i/:slug/randevu" element={<RequireAuth roles={['customer']}><BookingWizard /></RequireAuth>} />
            <Route path="/odeme/:id" element={<RequireAuth roles={['customer']}><Payment /></RequireAuth>} />
            <Route path="/onay/:id" element={<RequireAuth roles={['customer']}><Confirmation /></RequireAuth>} />
            <Route path="/randevularim" element={<RequireAuth roles={['customer']}><Appointments /></RequireAuth>} />
            <Route path="/favoriler" element={<RequireAuth roles={['customer']}><Favorites /></RequireAuth>} />
            <Route path="/destek" element={<RequireAuth><SupportCenter /></RequireAuth>} />
            <Route path="/profil" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/bildirimler" element={<RequireAuth><Notifications /></RequireAuth>} />
            <Route path="/yasal" element={<Navigate to="/yasal/aydinlatma-metni" replace />} />
            <Route path="/yasal/:slug" element={<LegalPage />} />
            <Route path="/sss" element={<Faq />} />
            <Route path="/isletmeler-icin" element={<ForBusiness />} />
            {/* City, district and category pages: /izmir, /izmir/kuafor, /izmir/karsiyaka, /izmir/karsiyaka/berber */}
            {CITIES.map((city) => (
              <Route key={city.slug} path={`/${city.slug}/:first?/:second?`} element={<Landing />} />
            ))}
          </Route>

          <Route path="/isletme/*" element={<RequireAuth roles={['business']}><OwnerArea /></RequireAuth>} />
          {/* First-admin setup is a one-time website task; the store apps do not offer it. */}
          {!isNative && <Route path="/yonetim/kurulum" element={<RequireAuth><AdminSetup /></RequireAuth>} />}
          <Route path="/yonetim/destek-ekibi" element={<RequireAuth><div className="min-h-screen bg-ink p-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:p-8 sm:pt-[calc(2rem+env(safe-area-inset-top))]"><SupportCenter workspace /></div></RequireAuth>} />
          <Route path="/yonetim/*" element={<RequireAuth roles={['admin']}><AdminArea /></RequireAuth>} />
          {/* Field agents are ordinary accounts listed in field_agents; FieldArea checks membership itself. */}
          <Route path="/saha/*" element={<RequireAuth><FieldArea /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/kesfet" replace />} />
        </Routes>
      </Suspense>
      <CookieNotice />
    </BrowserRouter>
  );
}
