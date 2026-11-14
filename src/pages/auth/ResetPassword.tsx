import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, Lock, ShieldAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { homePathFor } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Feedback';
import { useT } from '@/i18n/I18nProvider';
import type { Profile } from '@/lib/types';
import { AuthShell } from './AuthShell';

type Status = 'checking' | 'ready' | 'invalid' | 'done';

const LINK_WAIT_MS = 5000;

export default function ResetPassword() {
  const t = useT();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>(() => (/error_code=|error=/.test(window.location.hash) ? 'invalid' : 'checking'));
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [errors, setErrors] = useState<{ password?: string; password2?: string }>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status !== 'checking') return;
    let active = true;
    const markReady = () => active && setStatus((s) => (s === 'checking' ? 'ready' : s));

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) markReady();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });
    const timer = setTimeout(() => {
      if (active) setStatus((s) => (s === 'checking' ? 'invalid' : s));
    }, LINK_WAIT_MS);

    return () => {
      active = false;
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [status]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const next: typeof errors = {};
    if (password.length < 8) next.password = t.validation.password;
    if (password !== password2) next.password2 = t.validation.passwordMatch;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    setLoading(true);
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error || !data.user) {
      setLoading(false);
      setFormError(friendlyError(error));
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    setLoading(false);
    setStatus('done');
    window.history.replaceState(null, '', window.location.pathname);
    setTimeout(() => navigate(homePathFor(profile as Profile | null), { replace: true }), 1600);
  };

  if (status === 'checking') return <PageLoader />;

  if (status === 'invalid') {
    return (
      <AuthShell eyebrow="Hesap kurtarma" title="Bağlantı Geçersiz" subtitle="Bu şifre yenileme bağlantısının süresi dolmuş ya da daha önce kullanılmış.">
        <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-500/15 text-warning-300">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <p className="text-sm leading-relaxed text-mist">Güvenliğiniz için yenileme bağlantıları kısa süre geçerlidir ve yalnızca bir kez kullanılabilir. Yeni bir bağlantı isteyerek devam edebilirsiniz.</p>
        </div>
        <Button type="button" size="lg" full className="mt-6" onClick={() => navigate('/sifremi-unuttum')}>
          Yeni Bağlantı İste
        </Button>
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/giris" className="font-semibold text-gold-400 hover:text-gold-300">Giriş ekranına dön</Link>
        </p>
      </AuthShell>
    );
  }

  if (status === 'done') {
    return (
      <AuthShell eyebrow="Hesap kurtarma" title="Şifreniz Yenilendi" subtitle="Yeni şifrenizle oturumunuz açıldı, sizi yönlendiriyoruz.">
        <div className="flex animate-fade-up items-center gap-4 rounded-2xl border border-success-500/30 bg-success-900/40 p-6">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success-300" />
          <p className="text-sm text-success-300">Şifreniz başarıyla güncellendi.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Hesap kurtarma" title="Yeni Şifre Belirle" subtitle="Hesabınız için en az 8 karakterden oluşan yeni bir şifre seçin.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input label="Yeni Şifre" name="password" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
        <Input label="Yeni Şifre Tekrar" name="password2" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={password2} onChange={(e) => setPassword2(e.target.value)} error={errors.password2} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          Şifreyi Güncelle
        </Button>
      </form>
    </AuthShell>
  );
}
