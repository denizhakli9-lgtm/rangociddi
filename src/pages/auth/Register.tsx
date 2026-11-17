import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Lock, Mail, Phone, Store, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { isEmail, isPhone } from '@/lib/validation';
import { safeInternalPath } from '@/lib/safeRedirect';
import { LEGAL_VERSIONS, legalPath } from '@/lib/legal';
import { Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useT } from '@/i18n/I18nProvider';
import type { Gender } from '@/lib/types';
import { AuthShell } from './AuthShell';
import { newTabClick, publicUrl } from '@/lib/platform';

type AccountType = 'customer' | 'business';

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
  password2: string;
  terms: boolean;
}

export default function Register() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [type, setType] = useState<AccountType>(params.get('tip') === 'isletme' ? 'business' : 'customer');
  const [form, setForm] = useState<Form>({ fullName: '', email: '', phone: '', gender: 'unspecified', password: '', password2: '', terms: false });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (form.fullName.trim().length < 3) next.fullName = t.validation.name;
    if (!isEmail(form.email)) next.email = t.validation.email;
    if (!isPhone(form.phone)) next.phone = t.validation.phone;
    if (form.password.length < 8) next.password = t.validation.password;
    if (form.password !== form.password2) next.password2 = t.validation.passwordMatch;
    if (!form.terms) next.terms = t.validation.terms;
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;
    if (loading) return;

    const email = form.email.trim().toLowerCase();
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
          phone: form.phone.trim(),
          gender: form.gender,
          // Record of what the person accepted / was informed with, at sign-up time.
          terms_version: LEGAL_VERSIONS.terms,
          privacy_notice_version: LEGAL_VERSIONS.privacy,
          terms_accepted_at: new Date().toISOString(),
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
        setFormError('Kayıt tamamlanamadı. Bu e-posta ile hesabınız varsa giriş yapın veya şifrenizi sıfırlayın.');
        return;
      }
      setLoading(false);
      setFormError(friendlyError(error));
      return;
    }

    setLoading(false);
    if (!data.session) {
      setFormError(t.errors.confirmEmail);
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
    { value: 'customer', title: 'Müşteri', text: 'Randevu almak istiyorum', icon: User },
    { value: 'business', title: 'İşletme', text: 'Salonumu listelemek istiyorum', icon: Store },
  ];

  return (
    <AuthShell
      eyebrow="Ayrıcalıklı dünyaya katılın"
      title="Hesap Oluştur"
      subtitle={type === 'business' ? 'İşletmenizi Rango’da yayınlamak için önce hesabınızı oluşturun.' : 'Dakikalar içinde ilk randevunuzu alın.'}
    >
      <div className="mb-6 grid grid-cols-2 gap-3">
        {types.map(({ value, title, text, icon: Icon }) => {
          const active = type === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`relative rounded-2xl border p-4 text-left transition ${active ? 'border-gold-500/70 bg-gold-500/10 shadow-gold' : 'border-line bg-coal hover:border-gold-500/30'}`}
            >
              {active && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-ink">
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

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Input label="Ad Soyad" name="fullName" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} error={errors.fullName} icon={<User className="h-4 w-4" />} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="E-posta" name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={form.email} onChange={(e) => set('email', e.target.value)} error={errors.email} icon={<Mail className="h-4 w-4" />} />
          <Input label="Telefon" name="phone" type="tel" autoComplete="tel" placeholder="05XX XXX XX XX" value={form.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} icon={<Phone className="h-4 w-4" />} />
        </div>
        {type === 'customer' && (
          <Select label="Cinsiyet" name="gender" value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)} hint="Size uygun işletmeleri öne çıkarmamıza yardımcı olur.">
            {(Object.keys(t.gender) as Gender[]).map((g) => (
              <option key={g} value={g}>{t.gender[g]}</option>
            ))}
          </Select>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Şifre" name="password" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={form.password} onChange={(e) => set('password', e.target.value)} error={errors.password} icon={<Lock className="h-4 w-4" />} />
          <Input label="Şifre Tekrar" name="password2" type="password" autoComplete="new-password" autoCapitalize="none" autoCorrect="off" value={form.password2} onChange={(e) => set('password2', e.target.value)} error={errors.password2} icon={<Lock className="h-4 w-4" />} />
        </div>
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
            <Link to={legalPath('kullanim-kosullari')} target="_blank" onClick={newTabClick(legalPath('kullanim-kosullari'))} rel="noopener noreferrer" className="font-semibold text-gold-400 hover:text-gold-300">Kullanım Koşulları ve Üyelik Sözleşmesi</Link>
            ’ni ve{' '}
            <Link to={legalPath('iptal-iade')} target="_blank" onClick={newTabClick(legalPath('iptal-iade'))} rel="noopener noreferrer" className="font-semibold text-gold-400 hover:text-gold-300">İptal ve İade Koşulları</Link>
            ’nı okudum, kabul ediyorum.
            {errors.terms && <span id="terms-error" className="mt-1 block text-error-300">{errors.terms}</span>}
          </span>
        </label>
        <p className="text-xs leading-relaxed text-mist-2">
          Kişisel verileriniz, üyeliğinizin ve randevularınızın yürütülmesi amacıyla{' '}
          <Link to={legalPath('aydinlatma-metni')} target="_blank" onClick={newTabClick(legalPath('aydinlatma-metni'))} rel="noopener noreferrer" className="font-semibold text-gold-400 hover:text-gold-300">KVKK Aydınlatma Metni</Link>
          {' '}kapsamında işlenir.
        </p>
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          {type === 'business' ? 'İşletme Hesabı Oluştur' : 'Hesap Oluştur'}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-mist">
        Zaten hesabınız var mı?{' '}
        <Link to="/giris" className="font-semibold text-gold-400 hover:text-gold-300">Giriş yapın</Link>
      </p>
    </AuthShell>
  );
}
