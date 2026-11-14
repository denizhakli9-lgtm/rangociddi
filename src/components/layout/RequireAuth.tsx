import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, homePathFor } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import type { Role } from '@/lib/types';

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { session, profile, loading, signOut, refreshProfile } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (session && !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-warning-300" />
        <h1 className="font-display text-3xl text-white">Hesap bilgileri yüklenemedi</h1>
        <p className="mt-2 max-w-sm text-sm text-mist-2">Bağlantınızı kontrol edip tekrar deneyin.</p>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => refreshProfile()}>Tekrar Dene</Button>
          <Button variant="dark" onClick={() => signOut()}>Çıkış Yap</Button>
        </div>
      </div>
    );
  }
  if (!session) return <Navigate to={`/giris?sonra=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (profile?.is_suspended) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-error-300" />
        <h1 className="font-display text-3xl text-white">Hesabınız askıya alındı</h1>
        <p className="mt-2 max-w-sm text-sm text-mist-2">Detaylı bilgi için destek@hizmetburada.com adresinden bize ulaşabilirsiniz.</p>
        <Button variant="dark" className="mt-6" onClick={() => signOut()}>
          Çıkış Yap
        </Button>
      </div>
    );
  }
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to={homePathFor(profile)} replace />;
  return <>{children}</>;
}
