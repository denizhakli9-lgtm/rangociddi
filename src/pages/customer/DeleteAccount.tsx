import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { supportAction } from '@/lib/support';
import { friendlyError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useAsync } from '@/lib/useAsync';
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

/** Pending in-app deletion request of a business or admin account (account_deletion_requests). */
interface DeletionRequest { id: string; created_at: string; due_at: string }

/** Own pending request, or null. A read error (e.g. before the migration) counts as none. */
async function fetchPendingRequest(userId: string): Promise<DeletionRequest | null> {
  const { data, error } = await supabase.from('account_deletion_requests').select('id,created_at,due_at').eq('user_id', userId).eq('status', 'pending').maybeSingle();
  return error || !data ? null : (data as DeletionRequest);
}

/** Only used while the database does not have request_account_deletion yet: the request goes to the support team. */
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
  // Business and admin accounts may have payouts and duties to settle, so their deletion is a request that our
  // team completes within 30 days (the listing is hidden at once when that is safe). Customers are deleted at once.
  const canSelfDelete = profile.role === 'customer';
  const pending = useAsync(() => (canSelfDelete ? Promise.resolve(null) : fetchPendingRequest(profile.id)), [profile.id, canSelfDelete]);

  const close = () => {
    if (busy) return;
    setOpen(false);
    setConfirmed(false);
    setError('');
  };

  const finishRequest = async (dueAt: string | null, listingHidden: boolean) => {
    setOpen(false);
    await signOut();
    const due = dueAt ? formatDate(dueAt) : null;
    toast(
      [
        due
          ? tx(`Hesap silme talebiniz başlatıldı ve oturumunuz kapatıldı. Silme işlemi en geç ${due} tarihinde tamamlanır.`, `Your account deletion has been started and you have been signed out. It will be completed by ${due} at the latest.`)
          : tx('Hesap silme talebiniz başlatıldı ve oturumunuz kapatıldı. Silme işlemi en geç 30 gün içinde tamamlanır.', 'Your account deletion has been started and you have been signed out. It will be completed within 30 days.'),
        ...(listingHidden ? [tx('İşletmeniz yayından kaldırıldı.', 'Your business has been taken off the listings.')] : []),
      ].join(' '),
      'success',
    );
    navigate('/kesfet', { replace: true });
  };

  const run = async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try {
      if (canSelfDelete) {
        const { error: rpcError } = await supabase.rpc('delete_my_account');
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
      }
      const { data, error: requestError } = await supabase.rpc('request_account_deletion');
      if (!requestError) {
        const result = (data ?? {}) as { due_at?: string; listing_hidden?: boolean };
        await finishRequest(typeof result.due_at === 'string' ? result.due_at : null, !!result.listing_hidden);
        return;
      }
      if (requestError.message?.includes('VEYRA_LAST_ADMIN')) {
        setError(tx('Tek etkin yönetici sizsiniz. Silme talebinizi başka bir yöneticinin sonuçlandırabilmesi için önce yeni bir yönetici atayın.', 'You are the only active admin. Appoint another admin first so that they can complete your deletion request.'));
        return;
      }
      if (!isMissingFunction(requestError)) {
        setError(tx('Silme talebiniz şu anda kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin.', 'Your deletion request could not be saved right now. Please try again in a few minutes.'));
        return;
      }
      await requestDeletionViaSupport(profile);
      await finishRequest(null, false);
    } catch {
      setError(tx('Silme talebiniz şu anda kaydedilemedi. Lütfen birkaç dakika sonra tekrar deneyin.', 'Your deletion request could not be saved right now. Please try again in a few minutes.'));
    } finally {
      setBusy(false);
    }
  };

  // A request already started: say when it will be completed instead of offering the button again.
  if (pending.data) {
    return (
      <div className="flex items-start gap-3 border-t border-line pt-5">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
        <div>
          <p className="text-sm font-semibold text-white">{tx('Hesap silme talebiniz işleniyor', 'Your account deletion is in progress')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-mist-2">
            {tx(
              `Talebiniz ${formatDate(pending.data.created_at)} tarihinde alındı. Bekleyen randevu, iade ve hak edişler sonuçlandırıldıktan sonra hesabınız en geç ${formatDate(pending.data.due_at)} tarihinde silinir. Vazgeçerseniz Yardım ve Destek bölümünden bize yazabilirsiniz.`,
              `We received your request on ${formatDate(pending.data.created_at)}. Once pending bookings, refunds and payouts are settled, your account will be deleted by ${formatDate(pending.data.due_at)} at the latest. If you change your mind, write to us in Help & support.`,
            )}
          </p>
        </div>
      </div>
    );
  }

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
        subtitle={canSelfDelete ? tx('Bu işlem geri alınamaz.', 'This cannot be undone.') : tx('Silme işlemi şimdi başlar ve en geç 30 gün içinde tamamlanır.', 'Deletion starts now and is completed within 30 days.')}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close} disabled={busy}>{tx('Vazgeç', 'Cancel')}</Button>
            <Button variant="danger" onClick={run} loading={busy} disabled={!confirmed}>
              {canSelfDelete ? tx('Hesabımı kalıcı olarak sil', 'Permanently delete my account') : tx('Hesabımı silmeyi başlat', 'Start deleting my account')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-mist">
          {canSelfDelete ? (
            <ul className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
              <li>{tx('Adınız, e-posta adresiniz, telefonunuz, konumunuz, favorileriniz ve bildirimleriniz silinir.', 'Your name, email, phone, location, favourites and notifications are deleted.')}</li>
              <li>{tx('Yorumlarınız “Silinmiş kullanıcı” adıyla anonim olarak kalır.', 'Your reviews remain anonymously under “Deleted user”.')}</li>
              <li>{tx('Randevu, ödeme, satış onayı ve iade kayıtları; vergi, ticaret ve tüketici mevzuatı ile ödeme kuruluşu sözleşmemiz gereği yasal süre boyunca, kimliğinizle ilişkilendirilmeden saklanır.', 'Booking, payment, purchase-confirmation and refund records are kept for the period required by tax, commercial and consumer law and by our payment institution agreement, without being linked to your identity.')}</li>
              <li>{tx('Yaklaşan randevularınız varsa önce bunları iptal etmeniz gerekir.', 'If you have upcoming bookings, you need to cancel them first.')}</li>
            </ul>
          ) : (
            <ul className="list-disc space-y-1.5 pl-5 marker:text-gold-500">
              <li>{tx('Silme talebiniz hemen kaydedilir ve oturumunuz kapatılır.', 'Your deletion request is recorded immediately and you are signed out.')}</li>
              <li>{tx('Yaklaşan randevunuz yoksa işletmeniz aramalardan ve keşfetten hemen kaldırılır. Yaklaşan randevularınız varsa müşterileriniz randevu bilgilerini görebilsin diye işletmeniz bir süre daha görünür kalır; ekibimiz işletmenizi yayından kaldırarak yeni randevuları durdurur. Mevcut randevuları tamamlamanız ya da iptal etmeniz gerekir.', 'If you have no upcoming bookings, your business is removed from search and Discover at once. If you do, it stays visible for a while so your customers can still see their booking details; our team takes it off the listings to stop new bookings. You need to complete or cancel the existing bookings.')}</li>
              <li>{tx('Bekleyen randevu, iade ve hak edişler sonuçlandırıldıktan sonra, en geç 30 gün içinde adınız, e-posta adresiniz, telefonunuz ve giriş bilgileriniz silinir; işletmenizin iletişim bilgileri kaldırılır ve hesaba bir daha giriş yapılamaz.', 'Once pending bookings, refunds and payouts are settled, within 30 days at the latest, your name, email, phone and sign-in details are deleted, your business contact details are removed and the account can no longer be used.')}</li>
              <li>{tx('Randevu, ödeme, iade, komisyon, hak ediş (IBAN) ve satış onayı kayıtları; vergi ve ticari mevzuat ile ödeme kuruluşu sözleşmemiz gereği yasal süre boyunca saklanır.', 'Booking, payment, refund, commission, payout (IBAN) and purchase-confirmation records are kept for the period required by tax and commercial law and by our payment institution agreement.')}</li>
            </ul>
          )}
          <label className="flex cursor-pointer items-start gap-3 text-xs">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#D4AF37]" />
            <span>
              {canSelfDelete
                ? tx('Hesabımın silineceğini ve bu işlemin geri alınamayacağını anladım.', 'I understand that my account will be deleted and that this cannot be undone.')
                : tx('Hesabımın en geç 30 gün içinde silineceğini ve oturumumun şimdi kapatılacağını anladım.', 'I understand that my account will be deleted within 30 days and that I will be signed out now.')}
            </span>
          </label>
          {error && <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-300">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
