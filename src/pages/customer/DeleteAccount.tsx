import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { supportAction } from '@/lib/support';
import { friendlyError } from '@/lib/errors';
import { COMPANY } from '@/lib/legal';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { Profile } from '@/lib/types';

function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist/i.test(err.message ?? '');
}

const ERRORS: Record<string, string> = {
  VEYRA_ACTIVE_APPOINTMENTS: 'Yaklaşan veya ödeme/onay bekleyen randevunuz var. Hesabınızı silmeden önce bu randevuları iptal edin ya da tamamlanmasını bekleyin.',
  VEYRA_OPEN_REFUND: 'Sonuçlanmamış bir iade talebiniz var. İade süreci tamamlandıktan sonra hesabınızı silebilirsiniz.',
  VEYRA_FORBIDDEN: 'İşletme ve yönetici hesapları bu ekrandan silinemez. Talebiniz destek ekibine iletilecek.',
};

async function requestDeletionViaSupport(profile: Profile) {
  const thread = await supportAction('create', undefined, 'KVKK – Hesap silme talebi');
  await supportAction(
    'send',
    thread,
    [
      'KVKK md. 11 ve md. 7 kapsamında hesabımın kapatılmasını ve kişisel verilerimin silinmesini / anonim hale getirilmesini talep ediyorum.',
      `Hesap: ${profile.email ?? profile.id}`,
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
        toast('Hesabınız silindi. Kişisel verileriniz anonim hale getirildi.', 'success');
        navigate('/kesfet', { replace: true });
        return;
      }
      const code = Object.keys(ERRORS).find((k) => rpcError.message?.includes(k));
      if (code && code !== 'VEYRA_FORBIDDEN') {
        setError(ERRORS[code]);
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
        setError(`Talebiniz otomatik olarak iletilemedi. Lütfen hesabınızda kayıtlı e-posta adresinizden ${COMPANY.kvkkEmail} adresine “Hesap silme talebi” konulu bir e-posta gönderin; talebiniz en geç 30 gün içinde sonuçlandırılır.`);
        return;
      }
      setOpen(false);
      toast('Hesap silme talebiniz alındı. En geç 30 gün içinde sonuçlandırılarak size bildirilecek.', 'success');
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
        <p className="text-sm font-semibold text-white">Hesabımı sil</p>
        <p className="mt-0.5 text-xs text-mist-2">Hesabınız kapatılır ve kişisel verileriniz silinir veya anonim hale getirilir.</p>
      </div>
      <Button variant="danger" onClick={() => setOpen(true)} icon={<Trash2 className="h-4 w-4" />} className="shrink-0">
        Hesabımı sil
      </Button>

      <Modal
        open={open}
        onClose={close}
        title="Hesabınızı silmek istiyor musunuz?"
        subtitle="Bu işlem geri alınamaz."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={run} loading={busy} disabled={!confirmed}>Hesabımı kalıcı olarak sil</Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-mist">
          <ul className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
            <li>Adınız, e-posta adresiniz, telefonunuz, konumunuz, favorileriniz ve bildirimleriniz silinir.</li>
            <li>Yorumlarınız “Silinmiş kullanıcı” adıyla anonim olarak kalır.</li>
            <li>Randevu, ödeme ve iade kayıtları vergi ve ticari mevzuat gereği yasal süre boyunca, kimliğinizle ilişkilendirilmeden saklanır.</li>
            <li>Yaklaşan randevularınız varsa önce bunları iptal etmeniz gerekir.</li>
          </ul>
          {profile.role !== 'customer' && (
            <p className="rounded-xl border border-warning-500/30 bg-warning-900/30 px-4 py-3 text-xs text-warning-300">
              İşletme ve yönetici hesaplarında bekleyen ödeme ve hak edişler bulunabileceğinden talebiniz destek ekibimize iletilir ve en geç 30 gün içinde sonuçlandırılır.
            </p>
          )}
          <label className="flex cursor-pointer items-start gap-3 text-xs">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]" />
            <span>Hesabımın silineceğini ve bu işlemin geri alınamayacağını anladım.</span>
          </label>
          {error && <p className="rounded-xl border border-error-500/30 bg-error-900/40 px-4 py-3 text-sm text-error-300">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
