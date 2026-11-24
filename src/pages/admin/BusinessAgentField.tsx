import { useState } from 'react';
import { Briefcase } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { normalizeReferralCode, REFERRAL_CODE_PATTERN } from '@/lib/fieldAgent';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';

interface Referral {
  set_by: 'owner' | 'admin';
  field_agents: { code: string; profiles: { full_name: string } | null } | null;
}

/** Admin: which field agent brought this business, with a way to set or clear it. */
export function BusinessAgentField({ businessId }: { businessId: string }) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, reload, error } = useAsync(async () => {
    const { data: row, error: err } = await supabase
      .from('business_referrals')
      .select('set_by, field_agents(code, profiles(full_name))')
      .eq('business_id', businessId)
      .maybeSingle();
    if (err) throw err;
    return row as unknown as Referral | null;
  }, [businessId]);

  // Before the field-agent migration runs the table does not exist: show nothing.
  if (error) return null;

  const apply = async (next: string) => {
    setBusy(true);
    const { error: err } = await supabase.rpc('admin_set_business_agent', { p_business: businessId, p_code: next });
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast(next ? 'Saha temsilcisi atandı.' : 'Saha temsilcisi kaldırıldı.', 'success');
    setCode('');
    await reload();
  };

  return (
    <div className="rounded-xl border border-line bg-ink/40 p-4">
      <p className="mb-2 flex items-center gap-2 text-xs text-mist-2">
        <Briefcase className="h-3.5 w-3.5 text-gold-400" /> Saha temsilcisi
      </p>
      {data?.field_agents ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-white">
          {data.field_agents.profiles?.full_name ?? 'Saha elemanı'}
          <span className="font-mono text-xs tracking-[0.2em] text-gold-300">{data.field_agents.code}</span>
          <span className="text-xs text-mist-2">({data.set_by === 'owner' ? 'işletme kodu girdi' : 'yönetici atadı'})</span>
          <Button size="sm" variant="ghost" loading={busy} onClick={() => apply('')}>
            Kaldır
          </Button>
        </div>
      ) : (
        <p className="mb-3 text-sm text-mist">Atanmamış</p>
      )}
      <div className="flex gap-2">
        <input
          aria-label="Saha elemanı referans kodu"
          className="input h-9 w-32 py-1 font-mono text-sm uppercase tracking-[0.2em]"
          value={code}
          maxLength={6}
          placeholder="KOD"
          onChange={(e) => setCode(normalizeReferralCode(e.target.value))}
        />
        <Button size="sm" variant="dark" disabled={!REFERRAL_CODE_PATTERN.test(code)} loading={busy} onClick={() => apply(code)}>
          {data?.field_agents ? 'Değiştir' : 'Ata'}
        </Button>
      </div>
    </div>
  );
}
