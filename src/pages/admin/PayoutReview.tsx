import { useState } from 'react';
import { Check, Copy, Landmark } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { formatIban } from '@/lib/validation';
import type { PayoutAccount } from '@/lib/types';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { PayoutStatusBadge } from '@/components/ui/Badge';
import { ErrorState, Spinner } from '@/components/ui/Feedback';

export function PayoutReview({ businessId }: { businessId: string }) {
  const { toast } = useToast();
  const { data: account, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('business_payout_accounts').select('*').eq('business_id', businessId).maybeSingle();
    if (error) throw error;
    return (data as PayoutAccount | null) ?? null;
  }, [businessId]);

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = async (iban: string) => {
    try {
      await navigator.clipboard.writeText(iban);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Kopyalanamadı, IBAN’ı elle seçebilirsiniz.', 'error');
    }
  };

  const review = async (approve: boolean) => {
    if (!approve && !reason.trim()) return toast('Lütfen ret nedenini yazın.', 'error');
    setBusy(approve ? 'approve' : 'reject');
    const { error } = await supabase.rpc('review_payout_account', { p_business: businessId, p_approve: approve, p_reason: approve ? null : reason.trim() });
    setBusy(null);
    if (error) return toast(friendlyError(error), 'error');
    toast(approve ? 'IBAN onaylandı. İşletmeye bildirim gönderildi.' : 'IBAN reddedildi. İşletmeye bildirim gönderildi.', 'success');
    setRejecting(false);
    setReason('');
    reload();
  };

  return (
    <div className="rounded-2xl border border-line bg-ink/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium text-white"><Landmark className="h-4 w-4 text-gold" /> Ödeme hesabı</p>
        {!loading && !error && <PayoutStatusBadge status={account?.status ?? null} />}
      </div>

      {loading ? (
        <div className="grid place-items-center py-4"><Spinner className="h-5 w-5" /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !account ? (
        <p className="text-xs text-mist-2">İşletme henüz IBAN eklemedi.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="flex-1 select-all break-all font-mono text-sm tracking-wider text-white">{formatIban(account.iban)}</p>
            <button
              type="button"
              onClick={() => copy(account.iban)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line text-mist transition hover:border-gold/40 hover:text-gold"
              aria-label="IBAN kopyala"
            >
              {copied ? <Check className="h-4 w-4 text-success-300" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-mist-2">
            {account.account_holder}
            {account.bank_name ? ` · ${account.bank_name}` : ''} · Güncelleme: {formatDate(account.updated_at)}
          </p>
          {account.status === 'rejected' && account.rejection_reason && <p className="text-xs text-error-300">Ret nedeni: {account.rejection_reason}</p>}

          {rejecting ? (
            <div className="space-y-2">
              <Input label="Ret nedeni" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Örn. Hesap sahibi adı okunamıyor" />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setRejecting(false)} disabled={!!busy}>Vazgeç</Button>
                <Button variant="danger" loading={busy === 'reject'} onClick={() => review(false)}>Reddet</Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              {account.status !== 'rejected' && <Button variant="outline" onClick={() => setRejecting(true)} disabled={!!busy}>Reddet</Button>}
              {account.status !== 'verified' && <Button loading={busy === 'approve'} onClick={() => review(true)}>IBAN’ı doğrula</Button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
