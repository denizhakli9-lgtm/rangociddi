import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, homePathFor } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { COMPANY, filled, isPlaceholder, legalPath } from '@/lib/legal';
import type { Role } from '@/lib/types';

/** Shown when a session exists but its profile row could not be read. */
export function ProfileLoadError() {
  const { signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    const ok = await refreshProfile();
    setRetrying(false);
    if (!ok) toast('Bağlantı kurulamadı. Lütfen biraz sonra tekrar deneyin.', 'error');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-warning-300" />
      <h1 className="font-display text-3xl text-white">Hesap bilgileri yüklenemedi</h1>
      <p className="mt-2 max-w-sm text-sm text-mist-2">Bağlantınızı kontrol edip tekrar deneyin.</p>
      <div className="mt-6 flex gap-3">
        <Button loading={retrying} onClick={retry}>Tekrar Dene</Button>
        <Button variant="dark" onClick={() => signOut()}>Çıkış Yap</Button>
      </div>
    </div>
  );
}

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();
  const location = useLocation();

  // Never unmount a page that is already showing because of a background auth event.
  if (loading && !profile) return <PageLoader />;
  if (session && !profile) return <ProfileLoadError />;
  if (!session) return <Navigate to={`/giris?sonra=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (profile?.is_suspended) {
    const supportEmail = filled(COMPANY.email) && !isPlaceholder(COMPANY.email) ? COMPANY.email : null;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-error-300" />
        <h1 className="font-display text-3xl text-white">Hesabınız askıya alındı</h1>
        <p className="mt-2 max-w-sm text-sm text-mist-2">
          {supportEmail ? (
            <>
              Detaylı bilgi için{' '}
              <a href={`mailto:${supportEmail}`} className="text-gold-400 hover:text-gold-300">{supportEmail}</a>
              {' '}adresinden bize ulaşabilirsiniz.
            </>
          ) : (
            <>
              Detaylı bilgi için{' '}
              <Link to={legalPath('kunye')} className="text-gold-400 hover:text-gold-300">iletişim bilgilerimizden</Link>
              {' '}bize ulaşabilirsiniz.
            </>
          )}
        </p>
        <Button variant="dark" className="mt-6" onClick={() => signOut()}>
          Çıkış Yap
        </Button>
      </div>
    );
  }
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to={homePathFor(profile)} replace />;
  return <>{children}</>;
}
