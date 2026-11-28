import { useState } from 'react';
import { UserX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDate, formatDateTime } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge, BusinessStatusBadge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { BusinessStatus, Role } from '@/lib/types';

type Status = 'pending' | 'completed' | 'cancelled';
type Action = 'complete' | 'cancel' | 'hide';

/** Row of admin_list_account_deletion_requests(). Obligation counts are only computed for pending requests. */
interface Row {
  id: string;
  user_id: string;
  role: Role;
  full_name: string;
  email: string | null;
  phone: string | null;
  business_id: string | null;
  business_name: string | null;
  business_status: BusinessStatus | null;
  listing_hidden: boolean;
  status: Status;
  admin_note: string | null;
  created_at: string;
  due_at: string;
  resolved_at: string | null;
  upcoming_as_customer: number;
  upcoming_at_business: number;
  open_refunds: number;
}

const TONE = { pending: 'warning', completed: 'success', cancelled: 'neutral' } as const;
const LABEL: Record<Status, string> = { pending: 'Bekliyor', completed: 'Silindi', cancelled: 'Kapatıldı' };
const ROLE: Record<Role, string> = { customer: 'Müşteri', business: 'İşletme', admin: 'Yönetici' };

/** In-app deletion requests of business and admin accounts (App Store 5.1.1(v)); customers delete themselves at once. */
export default function AdminDeletionRequests() {
  const { profile: me } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Status>('pending');
  const [open, setOpen] = useState<{ row: Row; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.rpc('admin_list_account_deletion_requests');
    if (err) throw err;
    return (rows ?? []) as Row[];
  }, []);

  const rows = data ?? [];
  const list = rows.filter((r) => r.status === tab);
  const count = (s: Status) => rows.filter((r) => r.status === s).length;
  const blockers = (r: Row) => [
    ...(r.upcoming_at_business ? [`İşletmede ${r.upcoming_at_business} yaklaşan veya bekleyen randevu`] : []),
    ...(r.upcoming_as_customer ? [`Müşteri olarak ${r.upcoming_as_customer} yaklaşan randevu`] : []),
    ...(r.open_refunds ? [`${r.open_refunds} sonuçlanmamış iade talebi`] : []),
  ];

  const closeModal = () => {
    if (busy) return;
    setOpen(null);
    setNote('');
  };

  const resolve = async () => {
    if (!open) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('admin_resolve_account_deletion', { p_request: open.row.id, p_action: open.action, p_note: note.trim() });
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast(
      open.action === 'complete'
        ? 'Hesap silindi ve kişisel veriler anonim hale getirildi.'
        : open.action === 'hide'
          ? 'İşletme yayından kaldırıldı; yeni randevu alınamaz.'
          : 'Talep kapatıldı; kullanıcıya bildirim gönderildi.',
      'success',
    );
    setOpen(null);
    setNote('');
    reload();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Hesap silme"
        title="Hesap silme talepleri"
        text="İşletme ve yönetici hesapları silme talebini uygulamadan başlatır; talep en geç 30 gün içinde sonuçlandırılmalıdır. Yaklaşan randevusu olmayan işletmeler talep anında yayından kaldırılır; diğerlerinde yeni randevuları durdurmak için “Yayından kaldır”ı kullanın. Silme tamamlandığında kişisel veriler anonim hale getirilir; randevu, ödeme, komisyon, hak ediş ve satış onayı kayıtları yasal süre boyunca saklanır."
      />
      <div className="mb-6">
        <Segmented<Status>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: 'Bekleyen', count: count('pending') },
            { value: 'completed', label: 'Silinen', count: count('completed') },
            { value: 'cancelled', label: 'Kapatılan', count: count('cancelled') },
          ]}
        />
      </div>
      {loading && !data ? (
        <SkeletonList count={3} className="h-28" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<UserX className="h-6 w-6" />} title="Bu listede talep yok" />
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const blocked = blockers(r);
            const overdue = r.status === 'pending' && new Date(r.due_at).getTime() < Date.now();
            const own = r.user_id === me?.id;
            return (
              <div key={r.id} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{r.full_name}</p>
                    <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
                    <Badge>{ROLE[r.role]}</Badge>
                    {overdue && <Badge tone="error">Süresi geçti</Badge>}
                  </div>
                  {r.status === 'pending' && <p className="mt-1 break-all text-xs text-mist-2">{[r.email, r.phone].filter(Boolean).join(' · ')}</p>}
                  {r.business_name && (
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mist">
                      {r.business_name}
                      {r.business_status && <BusinessStatusBadge status={r.business_status} />}
                      {r.status === 'pending' && <span className="text-xs text-mist-2">{r.listing_hidden ? 'Silme talebi nedeniyle yayından kaldırıldı' : r.business_status === 'approved' ? 'Hâlâ yayında, yeni randevu alabilir' : 'Talep yayından kaldırmadı'}</span>}
                    </p>
                  )}
                  {r.status === 'pending' && blocked.length > 0 && (
                    <p className="mt-2 rounded-lg border border-warning-500/30 bg-warning-500/10 px-3 py-2 text-xs text-warning-300">
                      Silmeden önce sonuçlandırılmalı: {blocked.join(', ')}.
                    </p>
                  )}
                  {r.admin_note && <p className="mt-1 text-xs text-mist-2">Not: {r.admin_note}</p>}
                  <p className="mt-1 text-[11px] text-mist-3">
                    Talep: {formatDateTime(r.created_at)}
                    {r.status === 'pending' ? ` · Son tarih: ${formatDate(r.due_at)}` : r.resolved_at ? ` · Sonuç: ${formatDateTime(r.resolved_at)}` : ''}
                  </p>
                </div>
                {r.status === 'pending' && !own && (
                  <div className="flex flex-wrap gap-2">
                    {r.business_status === 'approved' && !r.listing_hidden && (
                      <Button size="sm" variant="outline" onClick={() => setOpen({ row: r, action: 'hide' })}>
                        Yayından kaldır
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setOpen({ row: r, action: 'cancel' })}>
                      Talebi kapat
                    </Button>
                    <Button size="sm" variant="danger" disabled={blocked.length > 0} onClick={() => setOpen({ row: r, action: 'complete' })}>
                      Hesabı sil
                    </Button>
                  </div>
                )}
                {r.status === 'pending' && own && <p className="text-xs text-mist-2">Kendi talebiniz başka bir yönetici tarafından sonuçlandırılır.</p>}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={closeModal}
        title={open?.action === 'complete' ? 'Hesabı kalıcı olarak sil' : open?.action === 'hide' ? 'İşletmeyi yayından kaldır' : 'Silme talebini kapat'}
        subtitle={open ? `${open.row.full_name}${open.row.business_name ? ` · ${open.row.business_name}` : ''}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={closeModal} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant={open?.action === 'complete' ? 'danger' : 'gold'} loading={busy} onClick={resolve}>
              {open?.action === 'complete' ? 'Hesabı sil' : open?.action === 'hide' ? 'Yayından kaldır' : 'Talebi kapat'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {open?.action === 'complete' ? (
            <div className="rounded-xl border border-error-500/30 bg-error-500/10 p-3 text-xs leading-relaxed text-error-300">
              Bu işlem geri alınamaz. Ad, e-posta, telefon ve giriş bilgileri silinir, hesap kapatılır; işletme yayından kaldırılır ve iletişim bilgileri temizlenir. Bekleyen hak edişler varsa önce ödenmiş olmalıdır. Randevu, ödeme, komisyon, hak ediş (IBAN) ve satış onayı kayıtları saklanır.
            </div>
          ) : open?.action === 'hide' ? (
            <p className="text-sm text-mist">İşletme aramalardan ve keşfetten kaldırılır, yeni randevu alınamaz. Mevcut randevular iptal edilmez, ancak müşteriler işletme sayfasını artık göremez; bu yüzden müşterilere haber verildikten ya da randevular azaldıktan sonra kullanın. Talep bekleyen olarak kalır; talebi kapatırsanız işletme yeniden yayına alınır.</p>
          ) : (
            <p className="text-sm text-mist">Hesap silinmez. Talep yayından kaldırdıysa işletme önceki durumuna döner. Kullanıcıya bildirim gönderilir.</p>
          )}
          {open?.action !== 'hide' && (
            <Textarea id="deletion-note" label="Not (isteğe bağlı)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} hint={open?.action === 'cancel' ? 'Kullanıcıya iletilen bildirimde yer alır.' : 'Yalnızca kayıtta tutulur.'} />
          )}
        </div>
      </Modal>
    </div>
  );
}
