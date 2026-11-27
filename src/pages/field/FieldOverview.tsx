import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Copy, Hourglass, Share2, Store, Wallet } from 'lucide-react';
import { StatCard } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { BusinessStatusBadge } from '@/components/ui/Badge';
import { ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { formatTRY } from '@/lib/format';
import { referralLink } from '@/lib/fieldAgent';
import { useField } from './FieldContext';
import { FieldDailyPlan } from './FieldDailyPlan';

export default function FieldOverview() {
  const { profile } = useAuth();
  const { me, businesses, loading, error, reload } = useField();
  const { toast } = useToast();
  const link = referralLink(me.code);

  const stats = useMemo(() => {
    const list = businesses ?? [];
    const bonuses = list.map((b) => b.bonus).filter((x): x is NonNullable<typeof x> => !!x);
    return {
      total: list.length,
      pending: list.filter((b) => b.status === 'pending'),
      approved: list.filter((b) => b.status === 'approved').length,
      bonusPending: bonuses.filter((x) => x.status === 'pending').reduce((s, x) => s + x.amount, 0),
      bonusPaid: bonuses.filter((x) => x.status === 'paid').reduce((s, x) => s + x.amount, 0),
    };
  }, [businesses]);

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} kopyalandı.`, 'success');
    } catch {
      toast('Kopyalanamadı; elle seçip kopyalayın.', 'error');
    }
  };

  const share = async () => {
    const text = `Rango'ya işletmenizi ücretsiz ekleyin. Kayıt olurken referans kodum: ${me.code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Rango işletme kaydı', text, url: link });
        return;
      } catch {
        /* closed by the user or not allowed: fall back to copying */
      }
    }
    await copy(`${text}\n${link}`, 'Davet metni');
  };

  return (
    <div>
      <PageHeader eyebrow="Saha paneli" title={`Merhaba, ${profile?.full_name?.split(' ')[0] || 'saha ekibi'}`} text="Ziyaret ettiğiniz işletmeleri kodunuzla Rango'ya kazandırın, başvurularını takip edin." />

      <FieldDailyPlan code={me.code} bonusAmount={me.bonus_amount} businesses={error ? null : businesses} onShare={share} />

      <section className="card-gold mb-8 p-6">
        <p className="eyebrow mb-2">Referans kodunuz</p>
        <div className="flex flex-wrap items-center gap-4">
          <p className="font-mono text-4xl tracking-[0.3em] text-white">{me.code}</p>
          <Button size="sm" variant="dark" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(me.code, 'Kod')}>
            Kodu kopyala
          </Button>
        </div>
        <p className="mt-4 text-sm text-mist">
          İşletme sahibi aşağıdaki bağlantıdan kayıt olursa kodunuz otomatik eklenir. Bağlantısız kayıtta, kurulumun ilk adımındaki "Referans kodu" alanına kodunuzu yazması yeterli.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-line bg-ink/50 px-3 py-2 text-xs text-mist">{link}</code>
          <Button size="sm" variant="dark" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(link, 'Bağlantı')}>
            Kopyala
          </Button>
          <Button size="sm" icon={<Share2 className="h-3.5 w-3.5" />} onClick={share}>
            Paylaş
          </Button>
        </div>
        <p className="mt-4 text-xs text-mist-2">Onaylanan her işletme için prim: {formatTRY(me.bonus_amount)}</p>
      </section>

      {loading && !businesses ? (
        <SkeletonList count={2} className="h-24" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Getirdiğim işletme" value={String(stats.total)} icon={<Store className="h-4 w-4" />} />
            <StatCard label="Onay bekleyen" value={String(stats.pending.length)} icon={<Hourglass className="h-4 w-4" />} />
            <StatCard label="Yayında" value={String(stats.approved)} icon={<CheckCircle2 className="h-4 w-4" />} />
            <StatCard label="Bekleyen prim" value={formatTRY(stats.bonusPending)} sub={`Ödenen ${formatTRY(stats.bonusPaid)}`} icon={<Wallet className="h-4 w-4" />} />
          </div>

          {stats.pending.length > 0 && (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold tracking-tight text-white">Onayınızı bekleyenler</h2>
                <Link to="/saha/isletmeler" className="inline-flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300">
                  Tümü <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="card divide-y divide-line-soft overflow-hidden">
                {stats.pending.slice(0, 5).map((b) => (
                  <Link key={b.id} to="/saha/isletmeler" className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">{b.name}</p>
                      <p className="truncate text-xs text-mist-2">
                        {b.district} · {b.owner_name ?? 'İşletme sahibi'}
                      </p>
                    </div>
                    <BusinessStatusBadge status={b.status} />
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
