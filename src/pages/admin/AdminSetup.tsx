import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { AuthShell } from '@/pages/auth/AuthShell';
import { Button } from '@/components/ui/Button';
import { ErrorState, PageLoader } from '@/components/ui/Feedback';

/**
 * The first-admin RPCs are meant to be revoked or dropped once the platform is
 * set up. "Function not found" or "permission denied" therefore means the setup
 * step is closed, not that something is broken.
 */
function isSetupClosed(err: unknown): boolean {
  const o = (err ?? {}) as { code?: unknown; message?: unknown };
  const code = String(o.code ?? '');
  const message = String(o.message ?? '');
  return (
    code === 'PGRST202' ||
    code === '42501' ||
    code === '42883' ||
    /permission denied|could not find the function|does not exist/i.test(message)
  );
}

export default function AdminSetup() {
  const { profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const { data: exists, loading, error, reload, setData } = useAsync(async () => {
    const { data, error: err } = await supabase.rpc('admin_exists');
    if (err) {
      if (isSetupClosed(err)) return true;
      throw err;
    }
    return Boolean(data);
  }, []);

  if (profile?.role === 'admin') return <Navigate to="/yonetim" replace />;
  if (loading) return <PageLoader />;

  const claim = async () => {
    setBusy(true);
    const { data, error: err } = await supabase.rpc('claim_first_admin');
    setBusy(false);
    // `false` means an admin already exists; a revoked/dropped RPC means the same.
    if (err ? isSetupClosed(err) : !data) {
      setData(true);
      return;
    }
    if (err) {
      toast(friendlyError(err), 'error');
      return;
    }
    await refreshProfile();
    toast('Yönetici yetkisi tanımlandı.', 'success');
    navigate('/yonetim', { replace: true });
  };

  return (
    <AuthShell eyebrow="Platform kurulumu" title="Yönetici hesabı" subtitle="Rango yönetim paneline erişim yalnızca ilk kurulumda, tek seferlik olarak tanımlanabilir.">
      {error ? (
        <ErrorState onRetry={reload} />
      ) : exists ? (
        <div className="card space-y-4 p-6">
          <p className="text-sm leading-relaxed text-mist">Platform kurulumu tamamlanmış. Bu sayfada yapılacak bir işlem bulunmuyor.</p>
          <Link to="/kesfet" className="text-sm text-gold-400 hover:text-gold-300">
            Ana sayfaya dön
          </Link>
        </div>
      ) : (
        <div className="card-gold space-y-5 p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold-500/15 text-gold-300">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-white">{profile?.full_name || profile?.email}</p>
              <p className="text-xs text-mist-2">{profile?.email}</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-mist">Bu hesap platformun ilk yöneticisi olarak atanacak. İşletme onayları, kullanıcılar, ödemeler, iadeler ve komisyon ayarları bu hesaptan yönetilir. İşlem geri alınamaz.</p>
          <Button full size="lg" loading={busy} onClick={claim}>
            Yönetici olarak devam et
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
