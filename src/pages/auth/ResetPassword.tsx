import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { CheckCircle2, Lock, MailCheck, ShieldAlert } from 'lucide-react';
import { clearRecoveryPending, isRecoveryPending, supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { homePathFor, useAuth } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Feedback';
import { useT } from '@/i18n/I18nProvider';
import type { Profile } from '@/lib/types';
import { AuthShell } from './AuthShell';
import { publicUrl } from '@/lib/platform';

// 'signed-in': an ordinary session without a recovery link. Setting a new
// password from it would skip any proof of account ownership, so the person is
// asked to use the e-mail link instead.
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
  // The link itself was rejected (expired / already used). Unlike a timeout,
  // a later auth event must not reopen the form.
  const [linkError] = useState(() => /error_code=|error=/.test(window.location.hash));
  const [status, setStatus] = useState<Status>(() => (linkError ? 'invalid' : 'checking'));
  // E-mail of the session the effect saw; AuthContext publishes its session
  // only after the profile has loaded, which can be later than this view.
  const [linkEmail, setLinkEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [errors, setErrors] = useState<{ password?: string; password2?: string }>({});
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
      if (current?.user.email) setLinkEmail(current.user.email);
      setStatus((s) => (s === 'checking' ? (current ? 'signed-in' : 'invalid') : s));
    };

    // Only a PASSWORD_RECOVERY for this account opens the form; any other
    // session (INITIAL_SESSION, SIGNED_IN on tab focus) does not.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      current = session;
      if (!session && active) setLinkEmail('');
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

  const sendLink = async () => {
    const address = authSession?.user.email || linkEmail;
    if (!address || sending) return;
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

  if (status === 'signed-in') {
    const email = authSession?.user.email || linkEmail;
    return (
      <AuthShell eyebrow="Hesap güvenliği" title="E-posta Doğrulaması Gerekli" subtitle="Güvenliğiniz için şifre değişikliği yalnızca e-posta adresinize gönderilen yenileme bağlantısıyla yapılabilir.">
        {sentTo ? (
          <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
              <MailCheck className="h-6 w-6" />
            </span>
            <p className="text-sm leading-relaxed text-mist">
              Yenileme bağlantısı <span className="font-semibold text-white">{sentTo}</span> adresine gönderildi. Bağlantıya tıklayarak yeni şifrenizi belirleyebilirsiniz. Gelen kutunuzda göremezseniz gereksiz klasörünü de kontrol edin.
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
                  Şifrenizi değiştirmek için <span className="font-semibold text-white">{email}</span> adresine bir yenileme bağlantısı gönderebiliriz.
                </>
              ) : (
                'Şifrenizi değiştirmek için hesabınıza kayıtlı e-posta adresine bir yenileme bağlantısı isteyin.'
              )}
            </p>
          </div>
        )}
        {formError && <p className="mt-4 rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{formError}</p>}
        {!sentTo && (
          <Button type="button" size="lg" full className="mt-6" loading={sending} onClick={email ? sendLink : () => navigate('/sifremi-unuttum')}>
            Yenileme Bağlantısı Gönder
          </Button>
        )}
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/profil" className="font-semibold text-gold-400 hover:text-gold-300">Hesabıma dön</Link>
        </p>
      </AuthShell>
    );
  }

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
