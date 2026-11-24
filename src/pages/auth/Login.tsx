import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchFieldAgentMe } from '@/lib/fieldAgent';
import { friendlyError } from '@/lib/errors';
import { isEmail } from '@/lib/validation';
import { safeInternalPath } from '@/lib/safeRedirect';
import { homePathFor, useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Feedback';
import { useT } from '@/i18n/I18nProvider';
import type { Profile } from '@/lib/types';
import { AuthShell } from './AuthShell';
import { tx } from '@/i18n/locale';

export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = safeInternalPath(params.get('sonra'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const { session, profile: authProfile, loading: authLoading } = useAuth();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isEmail(email)) next.email = t.validation.email;
    if (!password) next.password = t.validation.required;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.user) {
      setLoading(false);
      setFormError(friendlyError(error));
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    let home = homePathFor(profile as Profile | null);
    // Field agents have ordinary customer accounts; send them to their own panel.
    if (!redirect && home === '/kesfet' && (await fetchFieldAgentMe())) home = '/saha';
    setLoading(false);
    navigate(redirect ?? home, { replace: true });
  };

  // Already signed in (e.g. arriving from an e-mail confirmation link, which
  // auth-js turns into a session): skip the form. `!loading` keeps this from
  // racing the navigate in submit().
  if (!loading) {
    if (!authLoading && session && authProfile) return <Navigate to={redirect ?? homePathFor(authProfile)} replace />;
    // The stored session is still being read; avoid flashing the form at a signed-in user.
    if (authLoading) return <PageLoader />;
  }

  return (
    <AuthShell eyebrow={tx('Tekrar hoş geldiniz', 'Welcome back')} title={tx('Giriş Yap', 'Sign in')} subtitle={tx('Randevularınızı yönetmek için hesabınıza giriş yapın.', 'Sign in to your account to manage your bookings.')}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input label={tx('E-posta', 'Email')} name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} icon={<Mail className="h-4 w-4" />} placeholder={tx('ornek@eposta.com', 'you@example.com')} />
        <div>
          <Input label={tx('Şifre', 'Password')} name="password" type="password" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
          <div className="mt-2 text-right">
            <Link to="/sifremi-unuttum" className="text-xs font-medium text-mist transition hover:text-gold-300">
              {tx('Şifremi unuttum', 'Forgot password')}
            </Link>
          </div>
        </div>
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          {tx('Giriş Yap', 'Sign in')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-mist">
        {tx('Hesabınız yok mu?', 'No account yet?')}{' '}
        <Link to={`/kayit${redirect ? `?sonra=${encodeURIComponent(redirect)}` : ''}`} className="font-semibold text-gold-400 hover:text-gold-300">
          {tx('Hemen kaydolun', 'Sign up now')}
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-mist-2">
        <Link to="/kesfet" className="hover:text-white">{tx('Giriş yapmadan keşfetmeye devam et', 'Continue browsing without signing in')}</Link>
      </p>
    </AuthShell>
  );
}
