import { Navigate, Route, Routes } from 'react-router-dom';
import { Briefcase, CalendarRange, CreditCard, Megaphone, LayoutDashboard, MessageSquareWarning, Percent, Settings, Shapes, Store, Undo2, Users } from 'lucide-react';
import { DashboardLayout, type DashNavItem } from '@/components/layout/DashboardLayout';
import Notifications from '@/pages/Notifications';
import AdminOverview from './AdminOverview';
import AdminBusinesses from './AdminBusinesses';
import AdminUsers from './AdminUsers';
import AdminAppointments from './AdminAppointments';
import AdminPayments from './AdminPayments';
import AdminRefunds from './AdminRefunds';
import AdminReviews from './AdminReviews';
import AdminCategories from './AdminCategories';
import AdminCommissions from './AdminCommissions';
import AdminSettings from './AdminSettings';
import AdminBroadcasts from './AdminBroadcasts';
import AdminFieldAgents from './AdminFieldAgents';
import SupportCenter from '@/pages/support/SupportCenter';

const ITEMS: DashNavItem[] = [
  { to: '/yonetim', label: 'Genel bakış', icon: LayoutDashboard, end: true, primary: true },
  { to: '/yonetim/isletmeler', label: 'İşletmeler', icon: Store, primary: true },
  { to: '/yonetim/kullanicilar', label: 'Kullanıcılar', icon: Users },
  { to: '/yonetim/saha-ekibi', label: 'Saha ekibi', icon: Briefcase },
  { to: '/yonetim/randevular', label: 'Randevular', icon: CalendarRange, primary: true },
  { to: '/yonetim/odemeler', label: 'Ödemeler', icon: CreditCard },
  { to: '/yonetim/iadeler', label: 'İadeler', icon: Undo2, primary: true },
  { to: '/yonetim/yorumlar', label: 'Yorum moderasyonu', icon: MessageSquareWarning },
  { to: '/yonetim/kategoriler', label: 'Kategoriler', icon: Shapes },
  { to: '/yonetim/komisyon', label: 'Komisyon', icon: Percent },
  { to: '/yonetim/duyurular', label: 'Bildirim gönder', icon: Megaphone },
  { to: '/yonetim/destek', label: 'Destek merkezi', icon: MessageSquareWarning },
  { to: '/yonetim/ayarlar', label: 'Platform ayarları', icon: Settings },
];

export default function AdminArea() {
  return (
    <Routes>
      <Route element={<DashboardLayout title="Yönetim" items={ITEMS} notificationsPath="/yonetim/bildirimler" />}>
        <Route index element={<AdminOverview />} />
        <Route path="isletmeler" element={<AdminBusinesses />} />
        <Route path="kullanicilar" element={<AdminUsers />} />
        <Route path="saha-ekibi" element={<AdminFieldAgents />} />
        <Route path="randevular" element={<AdminAppointments />} />
        <Route path="odemeler" element={<AdminPayments />} />
        <Route path="iadeler" element={<AdminRefunds />} />
        <Route path="yorumlar" element={<AdminReviews />} />
        <Route path="kategoriler" element={<AdminCategories />} />
        <Route path="komisyon" element={<AdminCommissions />} />
        <Route path="duyurular" element={<AdminBroadcasts />} />
        <Route path="destek" element={<SupportCenter workspace />} />
        <Route path="ayarlar" element={<AdminSettings />} />
        <Route path="bildirimler" element={<Notifications />} />
        <Route path="*" element={<Navigate to="/yonetim" replace />} />
      </Route>
    </Routes>
  );
}
