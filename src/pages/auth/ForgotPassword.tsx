import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { isEmail } from '@/lib/validation';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useT } from '@/i18n/I18nProvider';
import { AuthShell } from './AuthShell';
import { publicUrl } from '@/lib/platform';

export default function ForgotPassword() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError('');
    if (!isEmail(email)) {
      setError(t.validation.email);
      return;
    }
    setError('');
    setLoading(true);
    const address = email.trim().toLowerCase();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: publicUrl('/sifre-yenile'),
    });
    setLoading(false);
    if (resetError) {
      setFormError(friendlyError(resetError));
      return;
    }
    setSentTo(address);
  };

  if (sentTo) {
    return (
      <AuthShell eyebrow="E-postanızı kontrol edin" title="Bağlantı Gönderildi" subtitle="Şifrenizi yenilemek için gelen kutunuzdaki bağlantıya tıklayın.">
        <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="text-sm leading-relaxed text-mist">
            <span className="font-semibold text-white">{sentTo}</span> adresine kayıtlı bir hesap varsa, şifre yenileme bağlantısı birkaç dakika içinde ulaşacak. Gelen kutunuzda göremezseniz gereksiz klasörünü de kontrol edin.
          </p>
        </div>
        <Button type="button" variant="ghost" full className="mt-6" onClick={() => setSentTo('')}>
          Farklı bir e-posta dene
        </Button>
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/giris" className="inline-flex items-center gap-2 font-semibold text-gold-400 hover:text-gold-300">
            <ArrowLeft className="h-4 w-4" /> Giriş ekranına dön
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Hesap kurtarma" title="Şifremi Unuttum" subtitle="Hesabınıza kayıtlı e-posta adresini girin, size şifre yenileme bağlantısı gönderelim.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input label="E-posta" name="email" type="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={error} icon={<Mail className="h-4 w-4" />} placeholder="ornek@eposta.com" />
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          Yenileme Bağlantısı Gönder
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-mist">
        <Link to="/giris" className="inline-flex items-center gap-2 font-semibold text-gold-400 hover:text-gold-300">
          <ArrowLeft className="h-4 w-4" /> Giriş ekranına dön
        </Link>
      </p>
    </AuthShell>
  );
}
