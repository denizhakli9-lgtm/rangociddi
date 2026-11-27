import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth, homePathFor } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { COMPANY, filled, isPlaceholder, legalPath } from '@/lib/legal';
import type { Role } from '@/lib/types';
import { tx } from '@/i18n/locale';

/** Shown when a session exists but its profile row could not be read. */
export function ProfileLoadError() {
  const { signOut, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    const ok = await refreshProfile();
    setRetrying(false);
    if (!ok) toast(tx('Bağlantı kurulamadı. Lütfen biraz sonra tekrar deneyin.', 'Could not connect. Please try again shortly.'), 'error');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-center">
      <ShieldAlert className="mb-4 h-12 w-12 text-warning-300" />
      <h1 className="text-xl font-semibold tracking-tight text-white">{tx('Hesap bilgileri yüklenemedi', 'Could not load your account')}</h1>
      <p className="mt-2 max-w-sm text-sm text-mist-2">{tx('Bağlantınızı kontrol edip tekrar deneyin.', 'Check your connection and try again.')}</p>
      <div className="mt-6 flex gap-3">
        <Button loading={retrying} onClick={retry}>{tx('Tekrar Dene', 'Try again')}</Button>
        <Button variant="dark" onClick={() => signOut()}>{tx('Çıkış Yap', 'Sign out')}</Button>
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
        <h1 className="text-xl font-semibold tracking-tight text-white">{tx('Hesabınız askıya alındı', 'Your account has been suspended')}</h1>
        <p className="mt-2 max-w-sm text-sm text-mist-2">
          {supportEmail ? (
            <>
              {tx('Detaylı bilgi için', 'For details, contact us at')}{' '}
              <a href={`mailto:${supportEmail}`} className="text-gold-400 hover:text-gold-300">{supportEmail}</a>
              {tx(' adresinden bize ulaşabilirsiniz.', '.')}
            </>
          ) : (
            <>
              {tx('Detaylı bilgi için', 'For details, see our')}{' '}
              <Link to={legalPath('kunye')} className="text-gold-400 hover:text-gold-300">{tx('iletişim bilgilerimizden', 'contact details')}</Link>
              {tx(' bize ulaşabilirsiniz.', '.')}
            </>
          )}
        </p>
        <Button variant="dark" className="mt-6" onClick={() => signOut()}>
          {tx('Çıkış Yap', 'Sign out')}
        </Button>
      </div>
    );
  }
  if (roles && profile && !roles.includes(profile.role)) return <Navigate to={homePathFor(profile)} replace />;
  return <>{children}</>;
}
