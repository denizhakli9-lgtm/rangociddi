import { useCallback } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { CalendarDays, CircleUser, Clock, LayoutDashboard, ListChecks, MessageSquare, Scissors, Store, Users, UserSquare2, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { BUSINESS_LIST_COLUMNS } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout, type DashNavItem } from '@/components/layout/DashboardLayout';
import { ErrorState, PageLoader } from '@/components/ui/Feedback';
import Notifications from '@/pages/Notifications';
import type { Business } from '@/lib/types';
import { businessSupportMessage } from '@/lib/whatsapp';
import { OwnerContext } from './OwnerContext';
import CreateBusiness from './CreateBusiness';
import Overview from './Overview';
import OwnerAppointments from './OwnerAppointments';
import OwnerCalendar from './OwnerCalendar';
import Services from './Services';
import Employees from './Employees';
import Hours from './Hours';
import BusinessProfile from './BusinessProfile';
import Customers from './Customers';
import OwnerReviews from './OwnerReviews';
import Earnings from './Earnings';

const ITEMS: DashNavItem[] = [
  { to: '/isletme', label: 'Panel', icon: LayoutDashboard, end: true, primary: true },
  { to: '/isletme/randevular', label: 'Randevular', icon: ListChecks, primary: true },
  { to: '/isletme/takvim', label: 'Takvim', icon: CalendarDays, primary: true },
  { to: '/isletme/hizmetler', label: 'Hizmetler', icon: Scissors },
  { to: '/isletme/calisanlar', label: 'Çalışanlar', icon: Users },
  { to: '/isletme/saatler', label: 'Çalışma Saatleri', icon: Clock },
  { to: '/isletme/musteriler', label: 'Müşteriler', icon: UserSquare2 },
  { to: '/isletme/yorumlar', label: 'Yorumlar', icon: MessageSquare },
  { to: '/isletme/kazanc', label: 'Kazanç & Komisyon', icon: Wallet, primary: true },
  { to: '/destek', label: 'Yardım ve Destek', icon: MessageSquare },
  // The owner's own account (/profil): personal details, "Verilerim ve gizlilik" and "Hesabımı sil".
  { to: '/profil', label: 'Hesabım', icon: CircleUser },
  { to: '/isletme/profil', label: 'İşletme Profili', icon: Store },
];

export default function OwnerArea() {
  const { profile } = useAuth();
  const { data, loading, error, reload, setData } = useAsync(async () => {
    const { data: row, error: err } = await supabase
      .from('businesses')
      .select(BUSINESS_LIST_COLUMNS)
      .eq('owner_id', profile!.id)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (err) throw err;
    return (row as unknown as Business | null) ?? null;
  }, [profile?.id]);

  const refresh = useCallback(async () => {
    await reload();
  }, [reload]);

  if (loading && !data) return <PageLoader />;
  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink p-6">
        <ErrorState onRetry={reload} />
      </div>
    );
  }
  if (!data) return <CreateBusiness onCreated={(b) => setData(b)} />;

  return (
    <OwnerContext.Provider value={{ business: data, reload: refresh }}>
      <Routes>
        <Route element={<DashboardLayout title={data.name} items={ITEMS} notificationsPath="/isletme/bildirimler" whatsAppMessage={businessSupportMessage(data.name)} />}>
          <Route index element={<Overview />} />
          <Route path="randevular" element={<OwnerAppointments />} />
          <Route path="takvim" element={<OwnerCalendar />} />
          <Route path="hizmetler" element={<Services />} />
          <Route path="calisanlar" element={<Employees />} />
          <Route path="saatler" element={<Hours />} />
          <Route path="musteriler" element={<Customers />} />
          <Route path="yorumlar" element={<OwnerReviews />} />
          <Route path="kazanc" element={<Earnings />} />
          <Route path="profil" element={<BusinessProfile />} />
          <Route path="bildirimler" element={<Notifications />} />
          <Route path="*" element={<Navigate to="/isletme" replace />} />
        </Route>
      </Routes>
    </OwnerContext.Provider>
  );
}
