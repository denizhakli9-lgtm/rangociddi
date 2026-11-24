import { useMemo } from 'react';
import { Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import { formatTRY } from '@/lib/format';
import { useField } from './FieldContext';

const LABEL = { pending: 'Ödeme bekliyor', paid: 'Ödendi', cancelled: 'İptal edildi' } as const;
const TONE = { pending: 'gold', paid: 'success', cancelled: 'neutral' } as const;

export default function FieldBonuses() {
  const { me, businesses, loading, error, reload } = useField();

  const rows = useMemo(() => (businesses ?? []).filter((b) => b.bonus).map((b) => ({ ...b, bonus: b.bonus! })), [businesses]);
  const sum = (s: keyof typeof LABEL) => rows.filter((r) => r.bonus.status === s).reduce((t, r) => t + r.bonus.amount, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Primlerim"
        title="Prim takibi"
        text={`Getirdiğiniz her işletme ilk kez onaylandığında ${formatTRY(me.bonus_amount)} prim yazılır. Ödemeler Rango yönetimi tarafından işaretlenir.`}
      />
      {loading && !businesses ? (
        <SkeletonList count={3} className="h-16" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Ödeme bekleyen" value={formatTRY(sum('pending'))} icon={<Wallet className="h-4 w-4" />} />
            <StatCard label="Ödenen" value={formatTRY(sum('paid'))} icon={<Wallet className="h-4 w-4" />} />
          </div>
          {!rows.length ? (
            <EmptyState icon={<Wallet className="h-6 w-6" />} title="Henüz prim yok" text="Getirdiğiniz bir işletme onaylandığında primi burada görünür." />
          ) : (
            <div className="card divide-y divide-line-soft overflow-hidden">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{r.name}</p>
                    <p className="truncate text-xs text-mist-2">{r.district}</p>
                  </div>
                  <p className="text-sm text-white">{formatTRY(r.bonus.amount)}</p>
                  <Badge tone={TONE[r.bonus.status]}>{LABEL[r.bonus.status]}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
