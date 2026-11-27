import { useMemo, useState, type FormEvent } from 'react';
import { Briefcase, Check, Undo2, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { formatDate, formatTRY } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { BonusStatus } from '@/lib/fieldAgent';
import type { BusinessStatus } from '@/lib/types';

interface AgentRow {
  user_id: string;
  code: string;
  bonus_amount: number;
  is_active: boolean;
  created_at: string;
  profiles: { full_name: string; email: string | null; phone: string | null } | null;
}

interface ReferralRow {
  agent_id: string;
  businesses: { status: BusinessStatus } | null;
}

interface BonusRow {
  business_id: string;
  agent_id: string;
  amount: number;
  status: BonusStatus;
  approved_by: string | null;
  created_at: string;
  resolved_at: string | null;
  businesses: { name: string; district: string } | null;
}

const BONUS_LABEL: Record<BonusStatus, string> = { pending: 'Ödeme bekliyor', paid: 'Ödendi', cancelled: 'İptal' };

async function load() {
  const [agents, referrals, bonuses] = await Promise.all([
    supabase.from('field_agents').select('user_id, code, bonus_amount, is_active, created_at, profiles(full_name, email, phone)').order('created_at'),
    supabase.from('business_referrals').select('agent_id, businesses(status)'),
    supabase.from('field_agent_bonuses').select('business_id, agent_id, amount, status, approved_by, created_at, resolved_at, businesses(name, district)').order('created_at', { ascending: false }),
  ]);
  if (agents.error) throw agents.error;
  if (referrals.error) throw referrals.error;
  if (bonuses.error) throw bonuses.error;
  return {
    agents: (agents.data ?? []) as unknown as AgentRow[],
    referrals: (referrals.data ?? []) as unknown as ReferralRow[],
    bonuses: ((bonuses.data ?? []) as unknown as BonusRow[]).map((b) => ({ ...b, amount: Number(b.amount) })),
  };
}

export default function AdminFieldAgents() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync(load, []);
  const [email, setEmail] = useState('');
  const [bonus, setBonus] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [bonusTab, setBonusTab] = useState<BonusStatus>('pending');
  const [edits, setEdits] = useState<Record<string, string>>({});

  const stats = useMemo(() => {
    const map = new Map<string, { total: number; approved: number; pending: number; paid: number }>();
    for (const a of data?.agents ?? []) map.set(a.user_id, { total: 0, approved: 0, pending: 0, paid: 0 });
    for (const r of data?.referrals ?? []) {
      const s = map.get(r.agent_id);
      if (!s) continue;
      s.total += 1;
      if (r.businesses?.status === 'approved') s.approved += 1;
    }
    for (const b of data?.bonuses ?? []) {
      const s = map.get(b.agent_id);
      if (!s) continue;
      if (b.status === 'pending') s.pending += b.amount;
      if (b.status === 'paid') s.paid += b.amount;
    }
    return map;
  }, [data]);

  const agentName = (id: string) => data?.agents.find((a) => a.user_id === id)?.profiles?.full_name ?? 'Saha elemanı';
  const bonusList = (data?.bonuses ?? []).filter((b) => b.status === bonusTab);

  const parseBonus = (raw: string) => {
    const n = Number(raw.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n * 100) / 100 : null;
  };

  const save = async (targetEmail: string, amount: number, active: boolean, key: string) => {
    setBusy(key);
    try {
      const { data: code, error: err } = await supabase.rpc('admin_set_field_agent', { p_email: targetEmail, p_bonus: amount, p_active: active });
      if (err) throw err;
      return code as string;
    } finally {
      setBusy(null);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseBonus(bonus || '0');
    if (!email.trim() || amount === null) {
      toast('E-posta ve 0–100.000 ₺ arasında bir prim tutarı girin.', 'error');
      return;
    }
    setAdding(true);
    try {
      const code = await save(email.trim(), amount, true, 'add');
      toast(`Saha elemanı eklendi. Referans kodu: ${code}`, 'success');
      setEmail('');
      setBonus('');
      await reload();
    } catch (err) {
      toast(friendlyError(err, 'Bu e-postayla kayıtlı bir hesap bulunamadı. Kişinin önce Rango\'ya e-postayla üye olması gerekir.'), 'error');
    } finally {
      setAdding(false);
    }
  };

  const update = async (a: AgentRow, patch: { bonus?: number; active?: boolean }) => {
    if (!a.profiles?.email) {
      toast('Bu hesabın e-postası yok; güncellenemiyor.', 'error');
      return;
    }
    try {
      await save(a.profiles.email, patch.bonus ?? Number(a.bonus_amount), patch.active ?? a.is_active, a.user_id);
      toast('Saha elemanı güncellendi.', 'success');
      setEdits((m) => {
        const next = { ...m };
        delete next[a.user_id];
        return next;
      });
      await reload();
    } catch (err) {
      toast(friendlyError(err), 'error');
    }
  };

  const setBonusStatus = async (b: BonusRow, status: BonusStatus) => {
    setBusy(`${b.business_id}:${status}`);
    const { error: err } = await supabase.rpc('admin_set_agent_bonus_status', { p_business: b.business_id, p_status: status });
    setBusy(null);
    if (err) return toast(friendlyError(err), 'error');
    toast(status === 'paid' ? 'Prim ödendi olarak işaretlendi.' : status === 'cancelled' ? 'Prim iptal edildi.' : 'Prim tekrar bekleyene alındı.', 'success');
    await reload();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Saha ekibi"
        title="Saha tanıtım ekibi"
        text="Saha elemanlarını e-postayla ekleyin, işletme başına primlerini belirleyin ve ödemeleri işaretleyin. Elemanlar /saha panelinden yalnızca kendi getirdikleri işletmeleri görür ve onaylayabilir."
      />

      <form onSubmit={add} className="card mb-8 grid gap-3 p-5 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Input
          label="E-posta"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Rango'ya üye olduğu e-posta"
        />
        <Input label="İşletme başı prim (₺)" inputMode="decimal" value={bonus} onChange={(e) => setBonus(e.target.value)} placeholder="ör. 500" />
        <Button type="submit" loading={adding} icon={<UserPlus className="h-4 w-4" />}>
          Ekibe ekle
        </Button>
        <p className="text-xs text-mist-2 sm:col-span-3">Kişinin e-postayla açılmış bir Rango hesabı olmalı; telefon numarasıyla kayıtlı hesaplar saha elemanı olarak eklenemez.</p>
      </form>

      {loading && !data ? (
        <SkeletonList count={3} className="h-20" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-10">
          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">Ekip</h2>
            {!data?.agents.length ? (
              <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Henüz saha elemanı yok" text="Yukarıdan e-postayla ekleyin; kişinin önce Rango'ya üye olması gerekir." />
            ) : (
              <div className="card divide-y divide-line-soft overflow-hidden">
                {data.agents.map((a) => {
                  const s = stats.get(a.user_id);
                  const edit = edits[a.user_id];
                  const editValue = edit !== undefined ? parseBonus(edit) : null;
                  return (
                    <div key={a.user_id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <div className="min-w-[180px] flex-1">
                        <p className="flex items-center gap-2 font-medium text-white">
                          {a.profiles?.full_name || 'İsimsiz'}
                          {!a.is_active && <Badge>Pasif</Badge>}
                        </p>
                        <p className="truncate text-xs text-mist-2">
                          {[a.profiles?.email, a.profiles?.phone, formatDate(a.created_at, { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className="rounded-lg border border-line bg-gold-500/5 px-2.5 py-1 font-mono text-sm tracking-[0.2em] text-gold-300">{a.code}</span>
                      <p className="text-xs text-mist">
                        {s?.total ?? 0} işletme · {s?.approved ?? 0} yayında
                        <br />
                        Bekleyen {formatTRY(s?.pending ?? 0)} · Ödenen {formatTRY(s?.paid ?? 0)}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          aria-label="İşletme başı prim"
                          inputMode="decimal"
                          className="input h-9 w-24 py-1 text-sm"
                          value={edit ?? String(Number(a.bonus_amount))}
                          onChange={(e) => setEdits((m) => ({ ...m, [a.user_id]: e.target.value }))}
                        />
                        <span className="text-xs text-mist-2">₺</span>
                        {edit !== undefined && (
                          <Button size="sm" disabled={editValue === null} loading={busy === a.user_id} onClick={() => editValue !== null && update(a, { bonus: editValue })}>
                            Kaydet
                          </Button>
                        )}
                      </div>
                      <Button size="sm" variant={a.is_active ? 'ghost' : 'dark'} loading={busy === a.user_id && edit === undefined} onClick={() => update(a, { active: !a.is_active })}>
                        {a.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-2 text-xs text-mist-2">Prim tutarındaki değişiklik yalnızca bundan sonra onaylanan işletmelere uygulanır. Pasif eleman panele giremez ve kodu yeni kayıtlarda geçmez.</p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-white">Primler</h2>
            <div className="mb-4 overflow-x-auto no-scrollbar">
              <Segmented<BonusStatus>
                value={bonusTab}
                onChange={setBonusTab}
                options={(['pending', 'paid', 'cancelled'] as BonusStatus[]).map((s) => ({
                  value: s,
                  label: BONUS_LABEL[s],
                  count: (data?.bonuses ?? []).filter((b) => b.status === s).length,
                }))}
              />
            </div>
            {!bonusList.length ? (
              <EmptyState icon={<Briefcase className="h-6 w-6" />} title="Bu listede prim yok" />
            ) : (
              <div className="card divide-y divide-line-soft overflow-hidden">
                {bonusList.map((b) => (
                  <div key={b.business_id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                    <div className="min-w-[180px] flex-1">
                      <p className="truncate font-medium text-white">{b.businesses?.name ?? 'İşletme'}</p>
                      <p className="truncate text-xs text-mist-2">
                        {agentName(b.agent_id)} · onay {formatDate(b.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    {b.approved_by === b.agent_id && <Badge tone="warning">Saha elemanı kendisi onayladı</Badge>}
                    <p className="text-sm text-white">{formatTRY(b.amount)}</p>
                    {b.status === 'pending' ? (
                      <>
                        <Button size="sm" variant="ghost" loading={busy === `${b.business_id}:cancelled`} icon={<X className="h-3.5 w-3.5" />} onClick={() => setBonusStatus(b, 'cancelled')}>
                          İptal
                        </Button>
                        <Button size="sm" loading={busy === `${b.business_id}:paid`} icon={<Check className="h-3.5 w-3.5" />} onClick={() => setBonusStatus(b, 'paid')}>
                          Ödendi
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="ghost" loading={busy === `${b.business_id}:pending`} icon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => setBonusStatus(b, 'pending')}>
                        Geri al
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
