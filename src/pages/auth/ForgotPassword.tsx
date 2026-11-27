import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck, MessageCircle, Smartphone, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { isEmail } from '@/lib/validation';
import { Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { useT } from '@/i18n/I18nProvider';
import { AuthShell } from './AuthShell';
import { publicUrl } from '@/lib/platform';
import { tx } from '@/i18n/locale';
import { isReservedEmail, isTrMobile, looksLikePhone } from '@/lib/phoneLogin';
import { WHATSAPP_SUPPORT, whatsAppLinkProps } from '@/lib/whatsapp';

const PHONE_HELP_MESSAGE = 'Merhaba, telefon numaramla kayıtlı işletme hesabımın şifresini unuttum.';

export default function ForgotPassword() {
  const t = useT();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');
  // Phone accounts have no mailbox (their login address is technical), so they get support instead of a link.
  const [phoneHelp, setPhoneHelp] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFormError('');
    const value = email.trim();
    if (looksLikePhone(value)) {
      if (!isTrMobile(value)) {
        // Only digits and phone separators: a mistyped number. Anything else (e.g. an e-mail without '@'): the combined message, as on Login.
        setError(/^[\d\s+().-]+$/.test(value) ? t.validation.mobile : t.validation.loginId);
        return;
      }
      setError('');
      setPhoneHelp(true);
      return;
    }
    // Never ask Supabase to mail a phone account's technical address.
    if (isReservedEmail(value)) {
      setError('');
      setPhoneHelp(true);
      return;
    }
    if (!isEmail(value)) {
      setError(t.validation.loginId);
      return;
    }
    setError('');
    setLoading(true);
    const address = value.toLowerCase();
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
      <AuthShell eyebrow={tx('E-postanızı kontrol edin', 'Check your email')} title={tx('Bağlantı Gönderildi', 'Link sent')} subtitle={tx('Şifrenizi yenilemek için gelen kutunuzdaki bağlantıya tıklayın.', 'Click the link in your inbox to reset your password.')}>
        <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
            <MailCheck className="h-6 w-6" />
          </span>
          <p className="text-sm leading-relaxed text-mist">
            {tx('', 'If an account is registered to ')}<span className="font-semibold text-white">{sentTo}</span>{tx(' adresine kayıtlı bir hesap varsa, şifre yenileme bağlantısı birkaç dakika içinde ulaşacak. Gelen kutunuzda göremezseniz gereksiz klasörünü de kontrol edin.', ', a password reset link will arrive within a few minutes. If you cannot see it in your inbox, check your spam folder too.')}
          </p>
        </div>
        <Button type="button" variant="ghost" full className="mt-6" onClick={() => setSentTo('')}>
          {tx('Farklı bir e-posta dene', 'Try a different email')}
        </Button>
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/giris" className="inline-flex items-center gap-2 font-semibold text-gold-400 hover:text-gold-300">
            <ArrowLeft className="h-4 w-4" /> {tx('Giriş ekranına dön', 'Back to sign in')}
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (phoneHelp) {
    return (
      <AuthShell eyebrow={tx('Hesap kurtarma', 'Account recovery')} title={tx('Destek Ekibimiz Yardımcı Olur', 'Our support team will help')} subtitle={tx('Telefon numarasıyla oluşturulan hesaplara e-postayla yenileme bağlantısı gönderilemez.', 'A reset link cannot be emailed to accounts created with a phone number.')}>
        <div className="animate-fade-up rounded-2xl border border-line bg-coal/60 p-6">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gold-500/15 text-gold-400">
            <Smartphone className="h-6 w-6" />
          </span>
          <p className="text-sm leading-relaxed text-mist">
            {tx('Hesabınıza kayıtlı telefon numarasından WhatsApp destek hattımıza (', 'Message our WhatsApp support line (')}<span className="font-semibold text-white">{WHATSAPP_SUPPORT.display}</span>{tx(') yazın. Ekibimiz numaranızı doğruladıktan sonra size geçici bir şifre gönderir; giriş yaptıktan sonra bu şifreyi kendi belirleyeceğiniz yeni bir şifreyle değiştirin.', ') from the phone number registered to your account. Once our team verifies your number, they will send you a temporary password; after signing in, change it to a new password of your own.')}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-mist-2">
            {tx('E-posta adresiyle kayıt olduysanız geri dönüp e-posta adresinizi girin; size yenileme bağlantısı gönderelim.', 'If you signed up with an email address, go back and enter your email; we will send you a reset link.')}
          </p>
        </div>
        <a {...whatsAppLinkProps(PHONE_HELP_MESSAGE)} className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-primary px-7 text-[15px] font-semibold tracking-wide text-primary-fg transition-all duration-200 hover:bg-primary/90 active:scale-[0.98]">
          <MessageCircle className="h-5 w-5" /> {tx('WhatsApp ile Yazın', 'Message us on WhatsApp')}
        </a>
        <Button type="button" variant="ghost" full className="mt-3" onClick={() => setPhoneHelp(false)}>
          {tx('E-posta adresimle dene', 'Try with my email')}
        </Button>
        <p className="mt-6 text-center text-sm text-mist">
          <Link to="/giris" className="inline-flex items-center gap-2 font-semibold text-gold-400 hover:text-gold-300">
            <ArrowLeft className="h-4 w-4" /> {tx('Giriş ekranına dön', 'Back to sign in')}
          </Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow={tx('Hesap kurtarma', 'Account recovery')} title={tx('Şifremi Unuttum', 'Forgot password')} subtitle={tx('Hesabınıza kayıtlı e-posta adresini girin, size şifre yenileme bağlantısı gönderelim. Telefon numarasıyla kayıt olduysanız numaranızı girin, size nasıl yardımcı olacağımızı gösterelim.', 'Enter the email address of your account and we will send you a password reset link. If you signed up with a phone number, enter it and we will show you how we can help.')}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Input label={tx('E-posta veya telefon', 'Email or phone')} name="username" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} error={error} icon={<UserRound className="h-4 w-4" />} placeholder={tx('ornek@eposta.com veya 05XX XXX XX XX', 'you@example.com or 05XX XXX XX XX')} />
        {formError && <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{formError}</p>}
        <Button type="submit" size="lg" full loading={loading}>
          {tx('Yenileme Bağlantısı Gönder', 'Send reset link')}
        </Button>
      </form>
      <p className="mt-8 text-center text-sm text-mist">
        <Link to="/giris" className="inline-flex items-center gap-2 font-semibold text-gold-400 hover:text-gold-300">
          <ArrowLeft className="h-4 w-4" /> {tx('Giriş ekranına dön', 'Back to sign in')}
        </Link>
      </p>
    </AuthShell>
  );
}
