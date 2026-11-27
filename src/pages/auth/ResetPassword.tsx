import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { CheckCircle2, KeyRound, Lock, MailCheck, ShieldAlert } from 'lucide-react';
import { clearRecoveryPending, isRecoveryPending, supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { homePathFor, useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Feedback';
import { useT } from '@/i18n/I18nProvider';
import type { Profile } from '@/lib/types';
import { AuthShell } from './AuthShell';
import { publicUrl } from '@/lib/platform';
import { tx } from '@/i18n/locale';
import { isPhoneLoginEmail } from '@/lib/phoneLogin';

// 'signed-in': an ordinary session without a recovery link. Setting a new
// password from it would skip any proof of account ownership, so the person is
// asked to use the e-mail link instead. Phone accounts (technical login address,
// no mailbox) instead change it here after re-entering the current password.
type Status = 'checking' | 'ready' | 'signed-in' | 'invalid' | 'done';

const LINK_WAIT_MS = 5000;
// auth-js announces PASSWORD_RECOVERY in a setTimeout once the link is consumed.
const EVENT_GRACE_MS = 400;

/** The URL still carries an e-mail link that auth-js may be processing. */
function hasLinkParams(): boolean {
  return /access_token=|refresh_token=|type=recovery/.test(window.location.hash) || /[?&](code|token_hash)=/.test(window.location.search);
}

export default function ResetPassword() {
  const t = useT();
  const navigate = useNavigate();
  const { session: authSession } = useAuth();
  const { toast } = useToast();
  // The link itself was rejected (expired / already used). Unlike a timeout,
  // a later auth event must not reopen the form.
  const [linkError] = useState(() => /error_code=|error=/.test(window.location.hash));
  const [status, setStatus] = useState<Status>(() => (linkError ? 'invalid' : 'checking'));
  // E-mail of the session the effect saw; AuthContext publishes its session
  // only after the profile has loaded, which can be later than this view.
  // Never holds a phone account's technical login address; phoneAccount marks those instead.
  const [linkEmail, setLinkEmail] = useState('');
  const [phoneAccount, setPhoneAccount] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [errors, setErrors] = useState<{ current?: string; password?: string; password2?: string }>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');

  useEffect(() => {
    let active = true;
    let current: Session | null = null;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // A genuine recovery may still arrive after the LINK_WAIT_MS fallback gave
    // up (slow connection), so it may replace a timeout-based 'invalid'.
    const markReady = () =>
      active && setStatus((s) => (s === 'checking' || s === 'signed-in' || (s === 'invalid' && !linkError) ? 'ready' : s));
    const settle = () => {
      if (!active) return;
      if (current && isRecoveryPending(current.user.id)) return markReady();
      if (isPhoneLoginEmail(current?.user.email)) setPhoneAccount(true);
      else if (current?.user.email) setLinkEmail(current.user.email);
      setStatus((s) => (s === 'checking' ? (current ? 'signed-in' : 'invalid') : s));
    };

    // Only a PASSWORD_RECOVERY for this account opens the form; any other
    // session (INITIAL_SESSION, SIGNED_IN on tab focus) does not.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      current = session;
      if (!session && active) {
        setLinkEmail('');
        setPhoneAccount(false);
      }
      if (session && (event === 'PASSWORD_RECOVERY' || isRecoveryPending(session.user.id))) markReady();
    });
    // getSession waits for auth-js to finish reading the link from the URL.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      current = data.session;
      if (data.session && isRecoveryPending(data.session.user.id)) return markReady();
      if (!hasLinkParams()) timers.push(setTimeout(settle, EVENT_GRACE_MS));
    });
    timers.push(setTimeout(settle, LINK_WAIT_MS));

    return () => {
      active = false;
      timers.forEach(clearTimeout);
      sub.subscription.unsubscribe();
    };
  }, [linkError]);

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
    clearRecoveryPending();
    // End sessions elsewhere (e.g. someone who had access before the reset); this device stays signed in.
    void supabase.auth.signOut({ scope: 'others' });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    setLoading(false);
    setStatus('done');
    window.history.replaceState(null, '', window.location.pathname);
    setTimeout(() => navigate(homePathFor(profile as Profile | null), { replace: true }), 1600);
  };

  // Phone accounts: prove the current password by signing in again (no e-mail or SMS is involved),
  // then set the new one. The login address is read from the session and never kept in state.
  const changeWithCurrent = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const next: typeof errors = {};
    if (!currentPassword) next.current = tx('Mevcut şifrenizi girin.', 'Enter your current password.');
    if (password.length < 8) next.password = t.validation.password;
    else if (currentPassword && password === currentPassword) next.password = t.errors.samePassword;
    if (password !== password2) next.password2 = t.validation.passwordMatch;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    setLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const loginId = sessionData.session?.user.email;
    if (!sessionData.session || !isPhoneLoginEmail(loginId)) {
      setLoading(false);
      setFormError(tx('Oturumunuz sona ermiş. Lütfen yeniden giriş yapın.', 'Your session has ended. Please sign in again.'));
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: loginId!, password: currentPassword });
    if (authError) {
      setLoading(false);
      if (authError.code === 'invalid_credentials' || /invalid login credentials/i.test(authError.message)) {
        setErrors({ current: tx('Mevcut şifreniz hatalı.', 'Your current password is incorrect.') });
      } else {
        setFormError(friendlyError(authError));
      }
      return;
    }
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error || !data.user) {
      setLoading(false);
      setFormError(friendlyError(error));
      return;
    }
    // End sessions elsewhere (e.g. whoever knew the temporary password); this device stays signed in.
    void supabase.auth.signOut({ scope: 'others' });
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    setLoading(false);
    setCurrentPassword('');
    setPassword('');
    setPassword2('');
    toast(tx('Şifreniz değiştirildi.', 'Your password has been changed.'));
    setStatus('done');
    setTimeout(() => navigate(homePathFor(profile as Profile | null), { replace: true }), 1600);
  };

  const sendLink = async () => {
    const address = authSession?.user.email || linkEmail;
    // A phone account's technical address has no mailbox and must never be mailed.
    if (!address || sending || isPhoneLoginEmail(address)) return;
    setSending(true);
    setFormError('');
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: publicUrl('/sifre-yenile'),
    });
    setSending(false);
    if (error) {
      setFormError(friendlyError(error));
      return;
    }
    setSentTo(address);
  };

  if (status === 'checking') return <PageLoader />;

  if (status === 'signed-in' && (phoneAccount || isPhoneLoginEmail(authSession?.user.email))) {
    return (
      <AuthShell eyebrow={tx('Hesap güvenliği', 'Account security')} title={tx('Şifre Değiştir', 'Change password')} subtitle={tx('Güvenliğiniz için önce mevcut şifrenizi girin, ardından en az 8 karakterden oluşan yeni şifrenizi belirleyin.', 'For your security, enter your current password first, then choose a new password of at least 8 characters.')}>
        <form onSubmit={changeWithCurrent} className="space-y-5" noValidate>
          <Input label={tx('Mevcut Şifre', 'Current password')} name="current-password" type="password" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} error={errors.current} icon={<KeyRound className="h-4 w-4" />} placeholder="••••••••" />
          <Input label={tx('Yeni Şifre', 'New password')} name="password" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
          <Input label={tx('Yeni Şifre Tekrar', 'Repeat new password')} name="password2" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={password2} onChange={(e) => setPassword2(e.target.value)} error={errors.password2} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
          {formError && <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{formError}</p>}
          <Button type="submit" size="lg" full loading={loading}>
            {tx('Şifreyi Değiştir', 'Change password')}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/profil" className="font-semibold text-gold-400 hover:text-gold-300">{tx('Hesabıma dön', 'Back to my account')}</Link>
        </p>
      </AuthShell>
    );
  }

  if (status === 'signed-in') {
    const email = authSession?.user.email || linkEmail;
    return (
      <AuthShell eyebrow={tx('Hesap güvenliği', 'Account security')} title={tx('E-posta Doğrulaması Gerekli', 'Email verification required')} subtitle={tx('Güvenliğiniz için şifre değişikliği yalnızca e-posta adresinize gönderilen yenileme bağlantısıyla yapılabilir.', 'For your security, your password can only be changed with the reset link sent to your email.')}>
        {sentTo ? (
          <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
              <MailCheck className="h-6 w-6" />
            </span>
            <p className="text-sm leading-relaxed text-mist">
              {tx('Yenileme bağlantısı ', 'A reset link was sent to ')}<span className="font-semibold text-white">{sentTo}</span>{tx(' adresine gönderildi. Bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz. Gelen kutunuzda göremezseniz gereksiz klasörünü de kontrol edin.', '. Click the link to set your new password. If you cannot see it in your inbox, check your spam folder too.')}
            </p>
          </div>
        ) : (
          <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-500/15 text-warning-300">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <p className="text-sm leading-relaxed text-mist">
              {email ? (
                <>
                  {tx('Şifrenizi değiştirmek için ', 'To change your password, we can send a reset link to ')}<span className="font-semibold text-white">{email}</span>{tx(' adresine bir yenileme bağlantısı gönderebiliriz.', '.')}
                </>
              ) : (
                tx('Şifrenizi değiştirmek için hesabınıza kayıtlı e-posta adresine bir yenileme bağlantısı isteyin.', 'To change your password, request a reset link to the email address of your account.')
              )}
            </p>
          </div>
        )}
        {formError && <p className="mt-4 rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{formError}</p>}
        {!sentTo && (
          <Button type="button" size="lg" full className="mt-6" loading={sending} onClick={email ? sendLink : () => navigate('/sifremi-unuttum')}>
            {tx('Yenileme Bağlantısı Gönder', 'Send reset link')}
          </Button>
        )}
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/profil" className="font-semibold text-gold-400 hover:text-gold-300">{tx('Hesabıma dön', 'Back to my account')}</Link>
        </p>
      </AuthShell>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthShell eyebrow={tx('Hesap kurtarma', 'Account recovery')} title={tx('Bağlantı Geçersiz', 'Invalid link')} subtitle={tx('Bu şifre yenileme bağlantısının süresi dolmuş ya da daha önce kullanılmış.', 'This password reset link has expired or has already been used.')}>
        <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warning-500/15 text-warning-300">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <p className="text-sm leading-relaxed text-mist">{tx('Güvenliğiniz için yenileme bağlantıları kısa süre geçerlidir ve yalnızca bir kez kullanılabilir. Yeni bir bağlantı isteyerek devam edebilirsiniz.', 'For your security, reset links are valid for a short time and can only be used once. Request a new link to continue.')}</p>
        </div>
        <Button type="button" size="lg" full className="mt-6" onClick={() => navigate('/sifremi-unuttum')}>
          {tx('Yeni Bağlantı İste', 'Request a new link')}
        </Button>
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/giris" className="font-semibold text-gold-400 hover:text-gold-300">{tx('Giriş ekranına dön', 'Back to sign in')}</Link>
        </p>
      </AuthShell>
    );
  }

  if (status === 'done') {
    return (
      <AuthShell eyebrow={tx('Hesap kurtarma', 'Account recovery')} title={tx('Şifreniz Yenilendi', 'Password updated')} subtitle={tx('Yeni şifrenizle oturumunuz açıldı, sizi yönlendiriyoruz.', 'You are signed in with your new password; redirecting you now.')}>
        <div className="flex animate-fade-up items-center gap-4 rounded-2xl border border-success-500/30 bg-success-500/10 p-6">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-success-300" />
          <p className="text-sm text-success-300">{tx('Şifreniz başarıyla güncellendi.', 'Your password has been updated.')}</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={tx('Hesap kurtarma', 'Account recovery')} title={tx('Yeni Şifre Belirle', 'Set a new password')} subtitle={tx('Hesabınız için en az 8 karakterden oluşan yeni bir şifre seçin.', 'Choose a new password of at least 8 characters.')}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input label={tx('Yeni Şifre', 'New password')} name="password" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
        <Input label={tx('Yeni Şifre Tekrar', 'Repeat new password')} name="password2" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={password2} onChange={(e) => setPassword2(e.target.value)} error={errors.password2} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          {tx('Şifreyi Güncelle', 'Update password')}
        </Button>
      </form>
    </AuthShell>
  );
}
