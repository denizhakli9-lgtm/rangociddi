import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, EyeOff, Flag, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDateTime } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Brand';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { ContentReport, ReportReason, ReportStatus, ReportTargetType } from '@/lib/types';

type Person = { full_name: string; email: string | null } | null;
type Row = ContentReport & {
  reporter: Person;
  reported: Person;
  businesses: { name: string; slug: string } | null;
};
type Tab = 'open' | 'closed';
type Action = 'remove' | 'resolve' | 'dismiss';

const TARGET: Record<ReportTargetType, string> = {
  review: 'Yorum',
  review_reply: 'İşletme yanıtı',
  message: 'Randevu mesajı',
  business: 'İşletme sayfası',
};
const REMOVE_LABEL: Record<ReportTargetType, string> = {
  review: 'Yorumu gizle',
  review_reply: 'Yanıtı kaldır',
  message: 'Mesajı gizle',
  business: 'İşletmeyi askıya al',
};
const REASON: Record<ReportReason, string> = {
  spam: 'Spam / reklam',
  harassment: 'Hakaret / taciz',
  inappropriate: 'Uygunsuz içerik',
  fake: 'Sahte / yanıltıcı',
  other: 'Diğer',
};
const STATUS: Record<ReportStatus, { label: string; tone: 'warning' | 'success' | 'neutral' }> = {
  open: { label: 'Açık', tone: 'warning' },
  actioned: { label: 'İşlem yapıldı', tone: 'success' },
  dismissed: { label: 'Reddedildi', tone: 'neutral' },
};

const SELECT =
  '*, reporter:profiles!content_reports_reporter_id_fkey(full_name, email), reported:profiles!content_reports_reported_user_id_fkey(full_name, email), businesses(name, slug)';

/** Apple expects reports to be handled within 24 hours (App Review guideline 1.2). */
const SLA_MS = 24 * 60 * 60 * 1000;

export default function AdminReports() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('open');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync(async () => {
    // Two queries: the open queue must never be cut off by the (2-year) history of closed reports.
    const [openRes, closedRes] = await Promise.all([
      // Oldest first, so the report closest to the 24-hour limit is on top.
      supabase.from('content_reports').select(SELECT).eq('status', 'open').order('created_at', { ascending: true }).limit(1000),
      supabase.from('content_reports').select(SELECT).neq('status', 'open').order('resolved_at', { ascending: false }).limit(200),
    ]);
    if (openRes.error) throw openRes.error;
    if (closedRes.error) throw closedRes.error;
    return { open: (openRes.data ?? []) as Row[], closed: (closedRes.data ?? []) as Row[] };
  }, []);

  const isOpen = (r: Row) => r.status === 'open';
  const list = (tab === 'open' ? data?.open : data?.closed) ?? [];
  const openCount = data?.open.length ?? 0;
  const closedCount = data?.closed.length ?? 0;

  const act = async (r: Row, action: Action) => {
    if (action === 'remove' && r.target_type === 'business' && !window.confirm(`${r.businesses?.name ?? 'İşletme'} askıya alınsın mı? İşletme yayından kalkar ve randevu alamaz.`)) return;
    setBusy(`${r.id}:${action}`);
    const { error: err } = await supabase.rpc('admin_resolve_content_report', { p_report: r.id, p_action: action, p_note: '' });
    setBusy(null);
    if (err) return toast(friendlyError(err), 'error');
    toast(action === 'remove' ? 'İçerik kaldırıldı, şikâyet kapatıldı.' : action === 'resolve' ? 'Şikâyet kapatıldı.' : 'Şikâyet reddedildi.', 'success');
    void reload();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Şikâyetler"
        title="Şikâyetler"
        text="Kullanıcıların bildirdiği yorumlar, işletme yanıtları, mesajlar ve işletme sayfaları. Her şikâyeti 24 saat içinde inceleyin. Aynı içerikle ilgili tüm açık şikâyetler birlikte kapatılır."
      />
      <div className="mb-6">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: 'Açık', count: openCount },
            { value: 'closed', label: 'Kapatılan', count: closedCount },
          ]}
        />
      </div>
      {loading && !data ? (
        <SkeletonList count={4} className="h-32" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<Flag className="h-6 w-6" />} title={tab === 'open' ? 'Açık şikâyet yok' : 'Kapatılan şikâyet yok'} />
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const overdue = isOpen(r) && Date.now() - new Date(r.created_at).getTime() > SLA_MS;
            return (
              <div key={r.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-white">{TARGET[r.target_type]}</p>
                      <Badge tone="info">{REASON[r.reason]}</Badge>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                      {overdue && <Badge tone="error">24 saat aşıldı</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-mist-2">
                      {formatDateTime(r.created_at)}
                      {r.businesses && (
                        <>
                          {' · '}
                          <Link to={`/i/${r.businesses.slug}`} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">{r.businesses.name}</Link>
                        </>
                      )}
                    </p>
                  </div>
                  {isOpen(r) && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="danger" loading={busy === `${r.id}:remove`} disabled={!!busy} onClick={() => act(r, 'remove')}>
                        <EyeOff className="h-4 w-4" />
                        {REMOVE_LABEL[r.target_type]}
                      </Button>
                      <Button size="sm" variant="outline" loading={busy === `${r.id}:resolve`} disabled={!!busy} onClick={() => act(r, 'resolve')} title="Örneğin hesap askıya alındıktan sonra">
                        <Check className="h-4 w-4" />
                        Çözüldü
                      </Button>
                      <Button size="sm" variant="ghost" loading={busy === `${r.id}:dismiss`} disabled={!!busy} onClick={() => act(r, 'dismiss')}>
                        <X className="h-4 w-4" />
                        Reddet
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-3 rounded-xl border border-line-soft bg-white/[0.02] p-3">
                  <p className="mb-1 text-xs text-gold-300">Şikâyet edilen içerik{r.reported ? ` · ${r.reported.full_name || 'Kullanıcı'}${r.reported.email ? ` (${r.reported.email})` : ''}` : ''}</p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-mist">{r.content_snapshot || '—'}</p>
                </div>
                {r.note && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm text-mist">
                    <span className="text-xs text-mist-2">Şikâyet notu: </span>
                    {r.note}
                  </p>
                )}
                <p className="mt-3 text-xs text-mist-2">
                  Şikâyet eden: {r.reporter?.full_name || 'Kullanıcı'}{r.reporter?.email ? ` (${r.reporter.email})` : ''}
                  {r.resolved_at && ` · Karar: ${formatDateTime(r.resolved_at)}`}
                  {r.reported_user_id && (
                    <>
                      {' · '}
                      <Link to="/yonetim/kullanicilar" className="underline underline-offset-2 hover:text-white">Hesabı askıya almak için Kullanıcılar</Link>
                    </>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
