import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CustomerLayout } from '@/components/layout/CustomerLayout';
import { RequireAuth } from '@/components/layout/RequireAuth';
import { PageLoader } from '@/components/ui/Feedback';
import { ScrollToTop } from '@/components/ScrollToTop';
import Splash from '@/pages/Splash';
import Login from '@/pages/auth/Login';
import Home from '@/pages/customer/Home';

const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Register = lazy(() => import('@/pages/auth/Register'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const LocationSelect = lazy(() => import('@/pages/customer/LocationSelect'));
const SearchPage = lazy(() => import('@/pages/customer/Search'));
const Categories = lazy(() => import('@/pages/customer/Categories'));
const BusinessDetail = lazy(() => import('@/pages/customer/BusinessDetail'));
const BookingWizard = lazy(() => import('@/pages/customer/booking/BookingWizard'));
const Payment = lazy(() => import('@/pages/customer/booking/Payment'));
const Confirmation = lazy(() => import('@/pages/customer/booking/Confirmation'));
const Appointments = lazy(() => import('@/pages/customer/Appointments'));
const Favorites = lazy(() => import('@/pages/customer/Favorites'));
const Profile = lazy(() => import('@/pages/customer/Profile'));
const SupportCenter = lazy(() => import('@/pages/support/SupportCenter'));
const Notifications = lazy(() => import('@/pages/Notifications'));

const OwnerArea = lazy(() => import('@/pages/owner/OwnerArea'));
const AdminArea = lazy(() => import('@/pages/admin/AdminArea'));
const AdminSetup = lazy(() => import('@/pages/admin/AdminSetup'));

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Splash />} />
          <Route path="/hosgeldin" element={<Onboarding />} />
          <Route path="/giris" element={<Login />} />
          <Route path="/kayit" element={<Register />} />
          <Route path="/sifremi-unuttum" element={<ForgotPassword />} />
          <Route path="/sifre-yenile" element={<ResetPassword />} />

          <Route element={<CustomerLayout />}>
            <Route path="/kesfet" element={<Home />} />
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
          </Route>

          <Route path="/isletme/*" element={<RequireAuth roles={['business']}><OwnerArea /></RequireAuth>} />
          <Route path="/yonetim/kurulum" element={<RequireAuth><AdminSetup /></RequireAuth>} />
          <Route path="/yonetim/destek-ekibi" element={<RequireAuth><div className="min-h-screen bg-ink p-4 sm:p-8"><SupportCenter workspace /></div></RequireAuth>} />
          <Route path="/yonetim/*" element={<RequireAuth roles={['admin']}><AdminArea /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/kesfet" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
