import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { supportAction } from '@/lib/support';
import { friendlyError } from '@/lib/errors';
import { COMPANY } from '@/lib/legal';
import { WHATSAPP_SUPPORT } from '@/lib/contact';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Profile } from '@/lib/types';
import { dict, tx } from '@/i18n/locale';

function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(err.message ?? '');
}

const ERROR_CODES = ['VEYRA_ACTIVE_APPOINTMENTS', 'VEYRA_OPEN_REFUND', 'VEYRA_FORBIDDEN'] as const;

async function requestDeletionViaSupport(profile: Profile) {
  const thread = await supportAction('create', undefined, 'KVKK – Hesap silme talebi');
  await supportAction(
    'send',
    thread,
    [
      'KVKK md. 11 ve md. 7 kapsamında hesabımın kapatılmasını ve kişisel verilerimin silinmesini / anonim hale getirilmesini talep ediyorum.',
      `Hesap: ${profile.email ?? profile.phone ?? profile.id}`,
      ...(profile.email ? [] : ['Giriş yöntemi: telefon']),
      `Hesap türü: ${profile.role}`,
      'Yasal saklama yükümlülüğü bulunan kayıtların ilgili süre boyunca saklanacağını biliyorum.',
    ].join('\n'),
  );
  // Goes straight to a human agent; the AI assistant never sees deletion requests.
  await supportAction('handoff', thread);
}

export function DeleteAccount({ profile }: { profile: Profile }) {
  const { signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirmed(false);
    setError('');
  };

  const run = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      const canSelfDelete = profile.role === 'customer';
      const { error: rpcError } = canSelfDelete ? await supabase.rpc('delete_my_account') : { error: { code: 'PGRST202', message: 'business account' } };
      if (!rpcError) {
        await signOut();
        toast(tx('Hesabınız silindi. Kişisel verileriniz anonim hale getirildi.', 'Your account has been deleted and your personal data anonymised.'), 'success');
        navigate('/kesfet', { replace: true });
        return;
      }
      const code = ERROR_CODES.find((k) => rpcError.message?.includes(k));
      if (code && code !== 'VEYRA_FORBIDDEN') {
        setError(dict().errors[code]);
        return;
      }
      if (!isMissingFunction(rpcError) && code !== 'VEYRA_FORBIDDEN') {
        setError(friendlyError(rpcError));
        return;
      }
      try {
        await requestDeletionViaSupport(profile);
      } catch {
        // Support channel unavailable (e.g. suspended account or too many open
        // tickets). KVKK md. 11 rights do not depend on that, so offer e-mail.
        setError(
          profile.email
            ? tx(`Talebiniz otomatik olarak iletilemedi. Lütfen hesabınızda kayıtlı e-posta adresinizden ${COMPANY.kvkkEmail} adresine “Hesap silme talebi” konulu bir e-posta gönderin; talebiniz en geç 30 gün içinde sonuçlandırılır.`, `Your request could not be sent automatically. Please email ${COMPANY.kvkkEmail} from your account’s email address with the subject “Account deletion request”; it will be completed within 30 days.`)
            : // Phone accounts have no mailbox of their own: the registered number identifies them instead.
              tx(`Talebiniz otomatik olarak iletilemedi. Lütfen hesabınızda kayıtlı telefon numaranızdan WhatsApp destek hattımıza (${WHATSAPP_SUPPORT.display}) “Hesap silme talebi” yazın; talebiniz en geç 30 gün içinde sonuçlandırılır.`, `Your request could not be sent automatically. Please send “Account deletion request” to our WhatsApp support line (${WHATSAPP_SUPPORT.display}) from your account’s registered phone number; it will be completed within 30 days.`),
        );
        return;
      }
      setOpen(false);
      toast(tx('Hesap silme talebiniz alındı. En geç 30 gün içinde sonuçlandırılarak size bildirilecek.', 'Your account deletion request has been received. It will be completed within 30 days and you will be notified.'), 'success');
      navigate('/destek');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-white">{tx('Hesabımı sil', 'Delete my account')}</p>
        <p className="mt-0.5 text-xs text-mist-2">{tx('Hesabınız kapatılır ve kişisel verileriniz silinir veya anonim hale getirilir.', 'Your account is closed and your personal data is deleted or anonymised.')}</p>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)} icon={<Trash2 className="h-4 w-4" />} className="shrink-0">
        {tx('Hesabımı sil', 'Delete my account')}
      </Button>

      <Modal
        open={open}
        onClose={close}
        title={tx('Hesabınızı silmek istiyor musunuz?', 'Delete your account?')}
        subtitle={tx('Bu işlem geri alınamaz.', 'This cannot be undone.')}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={busy}>{tx('Vazgeç', 'Cancel')}</Button>
            <Button variant="danger" onClick={run} loading={busy} disabled={!confirmed}>{tx('Hesabımı kalıcı olarak sil', 'Permanently delete my account')}</Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-mist">
          <ul className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
            <li>{tx('Adınız, e-posta adresiniz, telefonunuz, konumunuz, favorileriniz ve bildirimleriniz silinir.', 'Your name, email, phone, location, favourites and notifications are deleted.')}</li>
            <li>{tx('Yorumlarınız “Silinmiş kullanıcı” adıyla anonim olarak kalır.', 'Your reviews remain anonymously under “Deleted user”.')}</li>
            <li>{tx('Randevu, ödeme, satış onayı ve iade kayıtları; vergi, ticaret ve tüketici mevzuatı ile ödeme kuruluşu sözleşmemiz gereği yasal süre boyunca, kimliğinizle ilişkilendirilmeden saklanır.', 'Booking, payment, purchase-confirmation and refund records are kept for the period required by tax, commercial and consumer law and by our payment institution agreement, without being linked to your identity.')}</li>
            <li>{tx('Yaklaşan randevularınız varsa önce bunları iptal etmeniz gerekir.', 'If you have upcoming bookings, you need to cancel them first.')}</li>
          </ul>
          {profile.role !== 'customer' && (
            <p className="rounded-xl border border-warning-500/30 bg-warning-900/30 px-4 py-3 text-xs text-warning-300">
              {tx('İşletme ve yönetici hesaplarında bekleyen ödeme ve hak edişler bulunabileceğinden talebiniz destek ekibimize iletilir ve en geç 30 gün içinde sonuçlandırılır.', 'Business and admin accounts may have pending payments or payouts, so your request goes to our support team and is completed within 30 days.')}
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-3 text-xs">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]" />
            <span>{tx('Hesabımın silineceğini ve bu işlemin geri alınamayacağını anladım.', 'I understand that my account will be deleted and that this cannot be undone.')}</span>
          </label>
          {error && <p className="rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
