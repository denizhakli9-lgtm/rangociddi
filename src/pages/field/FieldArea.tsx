import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShieldAlert, Store, Wallet } from 'lucide-react';
import { DashboardLayout, type DashNavItem } from '@/components/layout/DashboardLayout';
import { ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { useAsync } from '@/lib/useAsync';
import { fetchFieldAgentBusinesses, fetchFieldAgentMe } from '@/lib/fieldAgent';
import { FieldContext } from './FieldContext';
import Notifications from '@/pages/Notifications';
import FieldOverview from './FieldOverview';
import FieldBusinesses from './FieldBusinesses';
import FieldBonuses from './FieldBonuses';

const ITEMS: DashNavItem[] = [
  { to: '/saha', label: 'Genel bakış', icon: LayoutDashboard, end: true, primary: true },
  { to: '/saha/isletmeler', label: 'İşletmelerim', icon: Store, primary: true },
  { to: '/saha/primler', label: 'Primlerim', icon: Wallet, primary: true },
];

export default function FieldArea() {
  const navigate = useNavigate();
  const me = useAsync(() => fetchFieldAgentMe(), []);
  const list = useAsync(() => (me.data ? fetchFieldAgentBusinesses() : Promise.resolve(null)), [me.data?.code]);

  if (me.loading && !me.data) return <PageLoader />;
  // A failed check is not "no access": offer a retry instead of telling an agent they were removed.
  if (me.error && !me.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink px-6">
        <ErrorState onRetry={me.reload} />
      </div>
    );
  }
  if (!me.data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-warning-300" />
        <h1 className="text-xl font-semibold tracking-tight text-white">Saha paneline erişiminiz yok</h1>
        <p className="mt-2 max-w-sm text-sm text-mist-2">
          Bu panel Rango saha tanıtım ekibi içindir. Ekibe eklendiyseniz, sizi ekleyen yöneticiye kayıtlı e-posta adresinizi doğrulatın.
        </p>
        <Button variant="dark" className="mt-6" onClick={() => navigate('/kesfet')}>
          Ana sayfaya dön
        </Button>
      </div>
    );
  }

  return (
    <FieldContext.Provider value={{ me: me.data, businesses: list.data, loading: list.loading, error: list.error, reload: list.reload }}>
      <Routes>
        <Route element={<DashboardLayout title="Saha Paneli" items={ITEMS} notificationsPath="/saha/bildirimler" />}>
          <Route index element={<FieldOverview />} />
          <Route path="isletmeler" element={<FieldBusinesses />} />
          <Route path="primler" element={<FieldBonuses />} />
          <Route path="bildirimler" element={<Notifications />} />
          <Route path="*" element={<Navigate to="/saha" replace />} />
        </Route>
      </Routes>
    </FieldContext.Provider>
  );
}
