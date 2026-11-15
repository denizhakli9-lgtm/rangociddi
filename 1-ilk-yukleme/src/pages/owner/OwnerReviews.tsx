import { useMemo, useState } from 'react';
import { MessageSquare, Reply } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatRelative } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { Avatar, Segmented, Stars } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Review } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';

type Tab = 'all' | 'unanswered';

export default function OwnerReviews() {
  const { business } = useOwnerBusiness();
  const [tab, setTab] = useState<Tab>('all');
  const { data, loading, error, reload, setData } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('reviews').select('*').eq('business_id', business.id).order('created_at', { ascending: false });
    if (err) throw err;
    return (rows ?? []) as Review[];
  }, [business.id]);

  const list = useMemo(() => (data ?? []).filter((r) => tab === 'all' || !r.owner_reply), [data, tab]);
  const dist = useMemo(() => [5, 4, 3, 2, 1].map((n) => ({ n, count: (data ?? []).filter((r) => r.rating === n).length })), [data]);
  const total = data?.length ?? 0;

  return (
    <div>
      <PageHeader eyebrow="Yorumlar" title="Müşteri deneyimi" text="Yalnızca tamamlanmış randevusu olan müşteriler yorum yapabilir. Yanıtlarınız herkese açık görünür." />

      {loading && !data ? (
        <SkeletonList count={4} className="h-28" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="card-gold h-fit p-6">
            <p className="font-display text-5xl text-white">{Number(business.rating_avg).toFixed(1)}</p>
            <Stars value={Number(business.rating_avg)} size="h-4 w-4" />
            <p className="mt-1 text-xs text-mist-2">{business.review_count} değerlendirme</p>
            <div className="mt-5 space-y-2">
              {dist.map(({ n, count }) => (
                <div key={n} className="flex items-center gap-2 text-xs text-mist-2">
                  <span className="w-3">{n}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-coal-3">
                    <div className="h-full rounded-full bg-gold-500 transition-all duration-700" style={{ width: total ? `${(count / total) * 100}%` : 0 }} />
                  </div>
                  <span className="w-6 text-right">{count}</span>
                </div>
              ))}
            </div>
          </aside>

          <div>
            <div className="mb-4">
              <Segmented<Tab>
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'all', label: 'Tümü', count: total },
                  { value: 'unanswered', label: 'Yanıtsız', count: (data ?? []).filter((r) => !r.owner_reply).length },
                ]}
              />
            </div>
            {!list.length ? (
              <EmptyState icon={<MessageSquare className="h-6 w-6" />} title={tab === 'all' ? 'Henüz yorum yok' : 'Tüm yorumları yanıtladınız'} text={tab === 'all' ? 'Tamamlanan randevulardan sonra müşterilerinize değerlendirme daveti gönderilir.' : undefined} />
            ) : (
              <div className="space-y-3">
                {list.map((r) => (
                  <ReviewItem key={r.id} review={r} onSaved={(reply) => setData((d) => (d ?? []).map((x) => (x.id === r.id ? { ...x, owner_reply: reply } : x)))} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewItem({ review, onSaved }: { review: Review; onSaved: (reply: string | null) => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(review.owner_reply ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc('reply_review', { p_review: review.id, p_reply: text });
    setSaving(false);
    if (error) return toast(friendlyError(error), 'error');
    toast('Yanıtınız yayınlandı.', 'success');
    setEditing(false);
    onSaved(text.trim() || null);
  };

  return (
    <article className="card p-5">
      <div className="flex items-start gap-3">
        <Avatar name={review.reviewer_name} size="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-white">{review.reviewer_name}</p>
            <Stars value={review.rating} />
            {review.is_hidden && <Badge tone="warning">Yönetim tarafından gizlendi</Badge>}
          </div>
          <p className="text-xs text-mist-2">
            {review.service_name} · {formatRelative(review.created_at)}
          </p>
        </div>
      </div>
      {review.comment && <p className="mt-3 text-sm leading-relaxed text-mist">{review.comment}</p>}

      {editing ? (
        <div className="mt-4 animate-fade-in space-y-3">
          <Textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Teşekkür edin, geri bildirimi yanıtlayın…" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Vazgeç
            </Button>
            <Button size="sm" loading={saving} onClick={save}>
              Yayınla
            </Button>
          </div>
        </div>
      ) : review.owner_reply ? (
        <div className="mt-4 rounded-xl border-l-2 border-gold-500/60 bg-ink/40 px-4 py-3">
          <p className="mb-1 text-[11px] uppercase tracking-[0.16em] text-gold-400">Yanıtınız</p>
          <p className="text-sm leading-relaxed text-mist">{review.owner_reply}</p>
          <button type="button" onClick={() => setEditing(true)} className="mt-2 text-xs text-mist-2 transition hover:text-white">
            Düzenle
          </button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="mt-4" icon={<Reply className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
          Yanıtla
        </Button>
      )}
    </article>
  );
}
