import { useState } from 'react';
import { Landmark, Pencil, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { formatIban, isValidTrIban, maskIban, normalizeIban } from '@/lib/validation';
import type { PayoutAccount } from '@/lib/types';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { PayoutStatusBadge } from '@/components/ui/Badge';
import { ErrorState, Spinner } from '@/components/ui/Feedback';

interface FormErrors {
  iban?: string;
  holder?: string;
  bank?: string;
}

export function PayoutAccountCard({ businessId }: { businessId: string }) {
  const { toast } = useToast();
  const { data: account, loading, error, reload } = useAsync(async () => {
    const { data, error } = await supabase.from('business_payout_accounts').select('*').eq('business_id', businessId).maybeSingle();
    if (error) throw error;
    return (data as PayoutAccount | null) ?? null;
  }, [businessId]);

  const [editing, setEditing] = useState(false);
  const [iban, setIban] = useState('');
  const [holder, setHolder] = useState('');
  const [bank, setBank] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setIban(account ? formatIban(account.iban) : 'TR');
    setHolder(account?.account_holder ?? '');
    setBank(account?.bank_name ?? '');
    setErrors({});
    setEditing(true);
  };

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!isValidTrIban(iban)) e.iban = 'TR ile başlayan 26 haneli geçerli bir IBAN girin.';
    const h = holder.trim();
    if (h.length < 3 || h.length > 120) e.holder = 'Hesap sahibinin adını girin (en az 3 karakter).';
    if (bank.trim().length > 80) e.bank = 'Banka adı en fazla 80 karakter olabilir.';
    return e;
  };

  const save = async () => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const { error } = await supabase.rpc('save_payout_account', {
      p_business: businessId,
      p_iban: normalizeIban(iban),
      p_holder: holder.trim(),
      p_bank: bank.trim(),
    });
    setSaving(false);
    if (error) {
      toast(friendlyError(error), 'error');
      return;
    }
    toast('Banka bilgileriniz kaydedildi, onay bekliyor.', 'success');
    setEditing(false);
    reload();
  };

  const ibanLive = normalizeIban(iban);
  const ibanHint = ibanLive.length === 26 ? (isValidTrIban(ibanLive) ? 'IBAN geçerli görünüyor.' : undefined) : `${ibanLive.length}/26 karakter`;

  return (
    <section className="card p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-white">Ödeme hesabı</h2>
        {!loading && !error && <PayoutStatusBadge status={account?.status ?? null} />}
      </div>
      <p className="mb-5 flex items-start gap-2 text-xs text-mist-2">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
        Kazançlarınız bu hesaba gönderilir. Bu bilgiyi yalnızca siz ve Rango yönetimi görebilir; müşteriler göremez.
      </p>

      {loading ? (
        <div className="grid place-items-center py-8"><Spinner /></div>
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : editing ? (
        <div className="space-y-4">
          <Input
            label="IBAN"
            value={iban}
            onChange={(e) => setIban(formatIban(e.target.value.replace(/[^0-9a-z]/gi, '')))}
            error={errors.iban}
            hint={ibanHint}
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            placeholder="TR00 0000 0000 0000 0000 0000 00"
            className="font-mono tracking-wider"
          />
          <Input label="Hesap sahibi" value={holder} onChange={(e) => setHolder(e.target.value)} error={errors.holder} hint="Şahıs veya şirket adı, bankadaki kayıtla aynı olmalı." maxLength={120} />
          <Input label="Banka adı (isteğe bağlı)" value={bank} onChange={(e) => setBank(e.target.value)} error={errors.bank} maxLength={80} placeholder="Örn. Ziraat Bankası" />
          {account && <p className="rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-xs text-warning-300">IBAN bilgisini değiştirdiğinizde hesabınız yeniden yönetim onayına gönderilir.</p>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>Vazgeç</Button>
            <Button onClick={save} loading={saving}>Kaydet</Button>
          </div>
        </div>
      ) : account ? (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-ink/60 p-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold/10 text-gold"><Landmark className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="font-mono text-sm tracking-wider text-white">{maskIban(account.iban)}</p>
              <p className="truncate text-xs text-mist-2">{account.account_holder}{account.bank_name ? ` · ${account.bank_name}` : ''}</p>
            </div>
          </div>
          {account.status === 'rejected' && account.rejection_reason && (
            <p className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-xs text-error-300">Ret nedeni: {account.rejection_reason}</p>
          )}
          {account.status === 'pending' && <p className="text-xs text-mist-2">Bilgileriniz yönetim tarafından kontrol ediliyor. Onaylandığında bildirim alacaksınız.</p>}
          <div className="flex justify-end">
            <Button variant="outline" onClick={startEdit} icon={<Pencil className="h-4 w-4" />}>Düzenle</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-line p-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-mist">Henüz banka hesabı eklemediniz. Ödeme alabilmek için IBAN bilginizi ekleyin.</p>
          <Button onClick={startEdit} icon={<Landmark className="h-4 w-4" />}>IBAN ekle</Button>
        </div>
      )}
    </section>
  );
}
