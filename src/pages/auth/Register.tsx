import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Eye, EyeOff, Lock, Mail, Phone, Store, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { formatTrPhone, isEmail, isPhone } from '@/lib/validation';
import { isReservedEmail, isTrMobile, phoneLoginEmail } from '@/lib/phoneLogin';
import { safeInternalPath } from '@/lib/safeRedirect';
import { LEGAL_VERSIONS, legalPath } from '@/lib/legal';
import { Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useT } from '@/i18n/I18nProvider';
import type { Gender } from '@/lib/types';
import { AuthShell } from './AuthShell';
import { newTabClick, publicUrl } from '@/lib/platform';
import { chosenLocale, tx } from '@/i18n/locale';

type AccountType = 'customer' | 'business';
/** How a business owner signs up; customers always use e-mail (payments need a real address). */
type SignupMethod = 'phone' | 'email';

function isAlreadyRegistered(err: unknown): boolean {
  const o = (err ?? {}) as { code?: unknown; message?: unknown };
  const code = String(o.code ?? '');
  const message = String(o.message ?? '');
  return code === 'user_already_exists' || code === 'email_exists' || /already registered|already been registered/i.test(message);
}

interface Form {
  fullName: string;
  email: string;
  phone: string;
  gender: Gender;
  password: string;
  terms: boolean;
}

export default function Register() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [type, setType] = useState<AccountType>(params.get('tip') === 'isletme' ? 'business' : 'customer');
  const [method, setMethod] = useState<SignupMethod>('phone');
  const [form, setForm] = useState<Form>({ fullName: '', email: '', phone: '', gender: 'unspecified', password: '', terms: false });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const usePhone = type === 'business' && method === 'phone';

  const chooseMethod = (m: SignupMethod) => {
    setMethod(m);
    setErrors((e) => ({ ...e, email: undefined, phone: undefined }));
    setFormError('');
  };

  // Typing in a field clears its error; leaving it checks it right away.
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const check = (key: keyof Form): string | undefined => {
    if (key === 'fullName') return form.fullName.trim().length < 3 ? t.validation.name : undefined;
    if (key === 'email') {
      if (usePhone) return undefined;
      if (!isEmail(form.email)) return t.validation.email;
      return isReservedEmail(form.email) ? t.validation.reservedEmail : undefined;
    }
    if (key === 'phone') {
      // A phone sign-up uses the number to log in, so it must be a real mobile number.
      if (usePhone) return isTrMobile(form.phone) ? undefined : t.validation.mobile;
      return isPhone(form.phone) ? undefined : t.validation.phone;
    }
    if (key === 'password') return form.password.length < 8 ? t.validation.password : undefined;
    if (key === 'terms') return form.terms ? undefined : t.validation.terms;
    return undefined;
  };

  const blur = (key: keyof Form) => () => {
    // An untouched, empty field is not an error yet.
    if (!String(form[key]).trim()) return;
    setErrors((e) => ({ ...e, [key]: check(key) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const keys = usePhone ? (['fullName', 'phone', 'password', 'terms'] as const) : (['fullName', 'email', 'phone', 'password', 'terms'] as const);
    for (const key of keys) {
      const msg = check(key);
      if (msg) next[key] = msg;
    }
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;
    if (loading) return;

    // Phone sign-up: the number becomes a technical login address that is never shown or mailed
    // (src/lib/phoneLogin.ts); the database keeps profiles.email empty for it.
    const email = usePhone ? phoneLoginEmail(form.phone) : form.email.trim().toLowerCase();
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        // Confirmation links return to this site (the origin must be in Supabase's Redirect URLs).
        emailRedirectTo: publicUrl('/giris'),
        data: {
          account_type: type,
          full_name: form.fullName.trim(),
          phone: usePhone ? formatTrPhone(form.phone) : form.phone.trim(),
          signup_method: usePhone ? 'phone' : 'email',
          gender: form.gender,
          // Record of what the person accepted / was informed with, at sign-up time.
          terms_version: LEGAL_VERSIONS.terms,
          privacy_notice_version: LEGAL_VERSIONS.privacy,
          terms_accepted_at: new Date().toISOString(),
          // Language the person signed up in (for future e-mails / notifications in their language).
          preferred_language: chosenLocale(),
        },
      },
    });

    if (error) {
      // The address is already registered (most often an earlier attempt that
      // actually succeeded). Instead of a dead end, sign the person in with the
      // credentials they just typed and carry on into the app.
      if (isAlreadyRegistered(error)) {
        const signIn = await supabase.auth.signInWithPassword({ email, password: form.password });
        if (!signIn.error && signIn.data.session) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', signIn.data.session.user.id)
            .maybeSingle();
          setLoading(false);
          go(profile?.role === 'business' ? 'business' : profile?.role === 'admin' ? 'admin' : 'customer');
          return;
        }
        setLoading(false);
        setFormError(
          usePhone
            ? tx('Bu telefon numarasıyla kayıtlı bir hesap var. Giriş yapın; şifrenizi hatırlamıyorsanız WhatsApp destek hattımıza yazın.', 'There is already an account with this phone number. Sign in; if you do not remember your password, message our WhatsApp support line.')
            : tx('Kayıt tamamlanamadı. Bu e-posta ile hesabınız varsa giriş yapın veya şifrenizi sıfırlayın.', 'Sign-up could not be completed. If you already have an account with this email, sign in or reset your password.'),
        );
        return;
      }
      setLoading(false);
      // The database refuses a phone sign-up whose number and login address disagree (handle_new_user).
      setFormError(usePhone && /database error saving new user/i.test(error.message) ? t.errors.VEYRA_PHONE_LOGIN_INVALID : friendlyError(error));
      return;
    }

    setLoading(false);
    if (!data.session) {
      // Phone accounts cannot confirm an e-mail; this only happens if e-mail confirmation is switched on in Supabase.
      setFormError(usePhone ? tx('Hesabınız oluşturuldu ancak oturum açılamadı. Lütfen giriş yapmayı deneyin veya destek ekibimize yazın.', 'Your account was created but you could not be signed in. Please try signing in or contact our support team.') : t.errors.confirmEmail);
      return;
    }
    go(type);
  };

  const go = (role: AccountType | 'admin') => {
    const safe = safeInternalPath(params.get('sonra'));
    if (role === 'business') navigate('/isletme', { replace: true });
    else if (role === 'admin') navigate('/yonetim', { replace: true });
    else navigate(safe ?? '/kesfet', { replace: true });
  };

  const types: { value: AccountType; title: string; text: string; icon: typeof User }[] = [
    { value: 'customer', title: tx('Müşteri', 'Customer'), text: tx('Randevu almak istiyorum', 'I want to book appointments'), icon: User },
    { value: 'business', title: tx('İşletme', 'Business'), text: tx('Salonumu listelemek istiyorum', 'I want to list my salon'), icon: Store },
  ];

  const businessSteps = [
    { title: tx('Hesabınızı oluşturun', 'Create your account'), text: tx('Şu an buradasınız · yaklaşık 1 dakika', 'You are here · about 1 minute') },
    { title: tx('İşletmenizi tanıtın', 'Introduce your business'), text: tx('Ad, kategori ve ilçe yeterli · yaklaşık 2 dakika', 'Name, category and district are enough · about 2 minutes') },
    { title: tx('Onay ve yayın', 'Approval and launch'), text: tx('Ekibimiz başvurunuzu inceler, onaylanınca müşteriler sizi görür', 'Our team reviews your application; once approved, customers can find you') },
  ];

  return (
    <AuthShell
      eyebrow={tx('Ayrıcalıklı dünyaya katılın', 'Join Rango')}
      title={tx('Hesap Oluştur', 'Create account')}
      subtitle={type === 'business' ? tx('İşletmenizi Rango’da yayınlamak için önce hesabınızı oluşturun.', 'Create your account first to publish your business on Rango.') : tx('Dakikalar içinde ilk randevunuzu alın.', 'Book your first appointment in minutes.')}
    >
      <div className="mb-6 grid grid-cols-2 gap-3">
        {types.map(({ value, title, text, icon: Icon }) => {
          const active = type === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                setType(value);
                setErrors((e) => ({ ...e, email: undefined, phone: undefined }));
                setFormError('');
              }}
              className={`relative rounded-2xl border p-4 text-left transition ${active ? 'border-gold-500/70 bg-gold-500/10 shadow-gold' : 'border-line bg-coal hover:border-white/30'}`}
            >
              {active && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-fg">
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
              )}
              <Icon className={`mb-3 h-5 w-5 ${active ? 'text-gold-400' : 'text-mist'}`} strokeWidth={1.6} />
              <p className="text-sm font-semibold text-white">{title}</p>
              <p className="mt-0.5 text-xs text-mist-2">{text}</p>
            </button>
          );
        })}
      </div>

      {type === 'business' && (
        <ol className="mb-6 space-y-3 rounded-2xl border border-line bg-coal p-4">
          {businessSteps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-3">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? 'bg-primary text-primary-fg' : 'border border-line text-mist-2'}`}>{i + 1}</span>
              <span>
                <span className={`block text-sm font-medium ${i === 0 ? 'text-white' : 'text-mist'}`}>{s.title}</span>
                <span className="block text-xs text-mist-2">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label={tx('Ad Soyad', 'Full name')} name="fullName" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} onBlur={blur('fullName')} error={errors.fullName} icon={<User className="h-4 w-4" />} />
        {type === 'business' && (
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-mist">{tx('Nasıl kaydolmak istersiniz?', 'How would you like to sign up?')}</legend>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {(
                [
                  { value: 'phone', label: tx('Telefon numarası', 'Phone number'), icon: Phone },
                  { value: 'email', label: tx('E-posta adresi', 'Email address'), icon: Mail },
                ] as const
              ).map(({ value, label, icon: Icon }) => {
                const active = method === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => chooseMethod(value)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${active ? 'border-gold-500/70 bg-gold-500/10 text-white' : 'border-line bg-coal text-mist hover:border-white/30'}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-gold-400' : 'text-mist-2'}`} />
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        {usePhone ? (
          <Input
            label={tx('Cep telefonu', 'Mobile number')}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="05XX XXX XX XX"
            value={form.phone}
            onChange={(e) => set('phone', formatTrPhone(e.target.value))}
            onBlur={blur('phone')}
            error={errors.phone}
            hint={tx('Giriş yaparken bu numarayı ve şifrenizi kullanacaksınız. E-posta adresi gerekmez.', 'You will sign in with this number and your password. No email address needed.')}
            icon={<Phone className="h-4 w-4" />}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label={tx('E-posta', 'Email')} name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={form.email} onChange={(e) => set('email', e.target.value)} onBlur={blur('email')} error={errors.email} icon={<Mail className="h-4 w-4" />} />
            <Input label={tx('Telefon', 'Phone')} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XX XXX XX XX" value={form.phone} onChange={(e) => set('phone', formatTrPhone(e.target.value))} onBlur={blur('phone')} error={errors.phone} icon={<Phone className="h-4 w-4" />} />
          </div>
        )}
        {type === 'customer' && (
          <Select label={tx('Cinsiyet', 'Gender')} name="gender" value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)} hint={tx('Size uygun işletmeleri öne çıkarmamıza yardımcı olur.', 'Helps us highlight businesses that suit you.')}>
            {(Object.keys(t.gender) as Gender[]).map((g) => (
              <option key={g} value={g}>{t.gender[g]}</option>
            ))}
          </Select>
        )}
        <Input
          label={tx('Şifre', 'Password')}
          name="password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          autoCapitalize="none"
          autoCorrect="off"
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          onBlur={blur('password')}
          error={errors.password}
          hint={tx('En az 8 karakter.', 'At least 8 characters.')}
          icon={<Lock className="h-4 w-4" />}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? tx('Şifreyi gizle', 'Hide password') : tx('Şifreyi göster', 'Show password')}
              aria-pressed={showPassword}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-mist-2 transition hover:text-white"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <label className="flex cursor-pointer items-start gap-3 pt-1 text-xs text-mist">
          <input
            type="checkbox"
            name="terms"
            checked={form.terms}
            onChange={(e) => set('terms', e.target.checked)}
            aria-invalid={!!errors.terms}
            aria-describedby={errors.terms ? 'terms-error' : undefined}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]"
          />
          <span>
            {tx('', 'I have read and accept the ')}
            <Link to={legalPath('kullanim-kosullari')} target="_blank" onClick={newTabClick(legalPath('kullanim-kosullari'))} rel="noopener noreferrer" className="font-semibold text-gold-400 hover:text-gold-300">{tx('Kullanım Koşulları ve Üyelik Sözleşmesi', 'Terms of Use and Membership Agreement')}</Link>
            {tx('’ni ve', ' and the')}{' '}
            <Link to={legalPath('iptal-iade')} target="_blank" onClick={newTabClick(legalPath('iptal-iade'))} rel="noopener noreferrer" className="font-semibold text-gold-400 hover:text-gold-300">{tx('İptal ve İade Koşulları', 'Cancellation & Refund Policy')}</Link>
            {tx('’nı okudum, kabul ediyorum.', ' (legal texts are in Turkish).')}
            {errors.terms && <span id="terms-error" className="mt-1 block text-error-300">{errors.terms}</span>}
          </span>
        </label>
        <p className="text-xs leading-relaxed text-mist-2">
          {tx('Kişisel verileriniz, üyeliğinizin ve randevularınızın yürütülmesi amacıyla', 'Your personal data is processed to run your membership and bookings, as described in the')}{' '}
          <Link to={legalPath('aydinlatma-metni')} target="_blank" onClick={newTabClick(legalPath('aydinlatma-metni'))} rel="noopener noreferrer" className="font-semibold text-gold-400 hover:text-gold-300">{tx('KVKK Aydınlatma Metni', 'Privacy Notice (KVKK)')}</Link>
          {tx(' kapsamında işlenir.', '.')}
        </p>
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          {type === 'business' ? tx('İşletme Hesabı Oluştur', 'Create business account') : tx('Hesap Oluştur', 'Create account')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-mist">
        {tx('Zaten hesabınız var mı?', 'Already have an account?')}{' '}
        <Link to="/giris" className="font-semibold text-gold-400 hover:text-gold-300">{tx('Giriş yapın', 'Sign in')}</Link>
      </p>
    </AuthShell>
  );
}
