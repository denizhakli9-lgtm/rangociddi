import { useState } from 'react';
import { Eye, EyeOff, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Segmented, Stars } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Review } from '@/lib/types';

type Row = Review & { businesses: { name: string } | null };
type Tab = 'all' | 'low' | 'hidden';

export default function AdminReviews() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, reload, setData } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('reviews').select('*, businesses(name)').order('created_at', { ascending: false }).limit(500);
    if (err) throw err;
    return (rows ?? []) as Row[];
  }, []);

  const match = (r: Row, t: Tab) => (t === 'all' ? true : t === 'low' ? r.rating <= 2 && !r.is_hidden : r.is_hidden);
  const list = (data ?? []).filter((r) => match(r, tab));
  const count = (t: Tab) => (data ?? []).filter((r) => match(r, t)).length;

  const toggle = async (r: Row) => {
    setBusy(r.id);
    const { error: err } = await supabase.rpc('admin_set_review_hidden', { p_review: r.id, p_hidden: !r.is_hidden });
    setBusy(null);
    if (err) return toast(friendlyError(err), 'error');
    toast(r.is_hidden ? 'Yorum yeniden yayında.' : 'Yorum gizlendi.', 'success');
    setData((d) => (d ?? []).map((x) => (x.id === r.id ? { ...x, is_hidden: !r.is_hidden } : x)));
  };

  return (
    <div>
      <PageHeader eyebrow="Yorumlar" title="Yorum moderasyonu" text="Gizlenen yorumlar herkese açık sayfalardan kaldırılır ve işletme puanına dahil edilmez." />
      <div className="mb-6">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'Tümü', count: count('all') },
            { value: 'low', label: 'Düşük puanlı', count: count('low') },
            { value: 'hidden', label: 'Gizlenen', count: count('hidden') },
          ]}
        />
      </div>
      {loading && !data ? (
        <SkeletonList count={4} className="h-28" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Yorum yok" />
      ) : (
        <div className="space-y-3">
          {list.map((r) => (
            <div key={r.id} className={`card p-5 transition ${r.is_hidden ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-white">{r.reviewer_name}</p>
                    <Stars value={r.rating} />
                    {r.is_hidden && <Badge tone="error">Gizli</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-mist-2">
                    {r.businesses?.name} · {r.service_name} · {formatDate(r.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Button size="sm" variant={r.is_hidden ? 'outline' : 'danger'} loading={busy === r.id} onClick={() => toggle(r)}>
                  {r.is_hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  {r.is_hidden ? 'Yayınla' : 'Gizle'}
                </Button>
              </div>
              {r.comment && <p className="mt-3 text-sm leading-relaxed text-mist">{r.comment}</p>}
              {r.owner_reply && (
                <div className="mt-3 rounded-xl border border-line-soft bg-white/[0.02] p-3 text-sm text-mist">
                  <p className="mb-1 text-xs text-gold-300">İşletme yanıtı</p>
                  {r.owner_reply}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
