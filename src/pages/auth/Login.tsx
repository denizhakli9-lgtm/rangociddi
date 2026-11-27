import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, MessageCircle, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchFieldAgentMe } from '@/lib/fieldAgent';
import { friendlyError } from '@/lib/errors';
import { isEmail } from '@/lib/validation';
import { isTrMobile, looksLikePhone, phoneLoginEmail } from '@/lib/phoneLogin';
import { whatsAppLinkProps } from '@/lib/whatsapp';
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
  // E-mail address, or the mobile number of a business account that signed up by phone.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const { session, profile: authProfile, loading: authLoading } = useAuth();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const byPhone = looksLikePhone(identifier);
    if (byPhone ? !isTrMobile(identifier) : !isEmail(identifier)) next.identifier = t.validation.loginId;
    if (!password) next.password = t.validation.required;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    setLoading(true);
    const email = byPhone ? phoneLoginEmail(identifier) : identifier.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoading(false);
      setFormError(
        byPhone && /invalid login credentials/i.test(error?.message ?? '')
          ? tx('Telefon numarası veya şifre hatalı. Telefonla giriş yalnızca telefon numarasıyla kaydolan işletme hesaplarında geçerlidir; e-postayla kaydolduysanız e-posta adresinizi girin.', 'Incorrect phone number or password. Phone sign-in only works for business accounts created with a phone number; if you signed up with email, enter your email address.')
          : friendlyError(error),
      );
      return;
    }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    let home = homePathFor(profile as Profile | null);
    // Field agents have ordinary customer accounts; send them to their own panel.
    if (!redirect && home === '/kesfet' && (await fetchFieldAgentMe().catch(() => null))) home = '/saha';
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
        <Input
          label={tx('E-posta veya telefon', 'Email or phone')}
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={errors.identifier}
          icon={<UserRound className="h-4 w-4" />}
          placeholder={tx('ornek@eposta.com veya 05XX XXX XX XX', 'you@example.com or 05XX XXX XX XX')}
        />
        <div>
          <Input label={tx('Şifre', 'Password')} name="password" type="password" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
          <div className="mt-2 text-right">
            <Link to="/sifremi-unuttum" className="text-xs font-medium text-mist transition hover:text-gold-300">
              {tx('Şifremi unuttum', 'Forgot password')}
            </Link>
          </div>
        </div>
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{formError}</p>}
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
        <a {...whatsAppLinkProps(tx('Merhaba, Rango hesabıma giriş yapamıyorum.', 'Hello, I cannot sign in to my Rango account.'))} className="inline-flex items-center gap-1 hover:text-white">
          <MessageCircle className="h-3.5 w-3.5" />
          {tx('Giriş yapamıyor musunuz? WhatsApp’tan yazın', 'Cannot sign in? Message us on WhatsApp')}
        </a>
      </p>
      <p className="mt-3 text-center text-xs text-mist-2">
        <Link to="/kesfet" className="hover:text-white">{tx('Giriş yapmadan keşfetmeye devam et', 'Continue browsing without signing in')}</Link>
      </p>
    </AuthShell>
  );
}
