import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { isEmail } from '@/lib/validation';
import { homePathFor } from '@/contexts/AuthContext';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useT } from '@/i18n/I18nProvider';
import type { Profile } from '@/lib/types';
import { AuthShell } from './AuthShell';

export default function Login() {
  const t = useT();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

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
    setLoading(false);
    const redirect = params.get('sonra');
    const safeRedirect = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : null;
    navigate(safeRedirect ?? homePathFor(profile as Profile | null), { replace: true });
  };

  return (
    <AuthShell eyebrow="Tekrar hoş geldiniz" title="Giriş Yap" subtitle="Randevularınızı yönetmek için hesabınıza giriş yapın.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input label="E-posta" name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} icon={<Mail className="h-4 w-4" />} placeholder="ornek@eposta.com" />
        <div>
          <Input label="Şifre" name="password" type="password" autoComplete="current-password" autoCapitalize="none" autoCorrect="off" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} icon={<Lock className="h-4 w-4" />} placeholder="••••••••" />
          <div className="mt-2 text-right">
            <Link to="/sifremi-unuttum" className="text-xs font-medium text-mist transition hover:text-gold-300">
              Şifremi unuttum
            </Link>
          </div>
        </div>
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          Giriş Yap
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-mist">
        Hesabınız yok mu?{' '}
        <Link to={`/kayit${params.get('sonra') ? `?sonra=${encodeURIComponent(params.get('sonra')!)}` : ''}`} className="font-semibold text-gold-400 hover:text-gold-300">
          Hemen kaydolun
        </Link>
      </p>
      <p className="mt-3 text-center text-xs text-mist-2">
        <Link to="/kesfet" className="hover:text-white">Giriş yapmadan keşfetmeye devam et</Link>
      </p>
    </AuthShell>
  );
}
