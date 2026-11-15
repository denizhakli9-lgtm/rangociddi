import { useMemo, useState } from 'react';
import { BadgeCheck, ExternalLink, Search, Sparkles, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { BUSINESS_LIST_COLUMNS } from '@/lib/api';
import { formatDate, formatTRY } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { safeImageUrl } from '@/lib/safeUrl';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Segmented } from '@/components/ui/Brand';
import { Badge, BusinessStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Business, BusinessStatus, Profile } from '@/lib/types';
import { PayoutReview } from './PayoutReview';

type Tab = 'all' | BusinessStatus;

export default function AdminBusinesses() {
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Business | null>(null);
  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('businesses').select(BUSINESS_LIST_COLUMNS).order('created_at', { ascending: false });
    if (err) throw err;
    return (rows ?? []) as unknown as Business[];
  }, []);

  const count = (s: Tab) => (data ?? []).filter((b) => s === 'all' || b.status === s).length;
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return (data ?? []).filter((b) => (tab === 'all' || b.status === tab) && (!q || b.name.toLocaleLowerCase('tr-TR').includes(q) || b.district.toLocaleLowerCase('tr-TR').includes(q)));
  }, [data, tab, query]);

  return (
    <div>
      <PageHeader eyebrow="İşletmeler" title="İşletme doğrulama" text="Başvuruları inceleyin, onaylayın; doğrulanmış ve öne çıkan işletmeleri belirleyin." />
      <div className="mb-4 overflow-x-auto no-scrollbar">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: 'Bekleyen', count: count('pending') },
            { value: 'approved', label: 'Onaylı', count: count('approved') },
            { value: 'suspended', label: 'Askıda', count: count('suspended') },
            { value: 'rejected', label: 'Reddedilen', count: count('rejected') },
            { value: 'all', label: 'Tümü', count: count('all') },
          ]}
        />
      </div>
      <div className="mb-6 max-w-md">
        <Input aria-label="İşletme ara" placeholder="İşletme adı veya ilçe" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
      </div>

      {loading && !data ? (
        <SkeletonList count={5} className="h-20" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<Store className="h-6 w-6" />} title="Bu listede işletme yok" />
      ) : (
        <div className="card divide-y divide-line-soft overflow-hidden">
          {list.map((b) => {
            const thumb = safeImageUrl(b.logo_url) ?? safeImageUrl(b.cover_url);
            return (
              <button key={b.id} type="button" onClick={() => setOpen(b)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.03]">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-line bg-coal-3">{thumb && <img src={thumb} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-medium text-white">
                    {b.name}
                    {b.is_verified && <BadgeCheck className="h-4 w-4 shrink-0 text-gold-400" />}
                    {b.is_featured && <Sparkles className="h-3.5 w-3.5 shrink-0 text-gold-300" />}
                    {!b.owner_id && <Badge>Örnek işletme</Badge>}
                  </p>
                  <p className="truncate text-xs text-mist-2">
                    {b.categories?.name} · {b.district} · {formatDate(b.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <BusinessStatusBadge status={b.status} />
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <BusinessModal
          key={open.id}
          business={open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function BusinessModal({ business, onClose, onSaved }: { business: Business; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [verified, setVerified] = useState(business.is_verified);
  const [featured, setFeatured] = useState(business.is_featured);
  const [busy, setBusy] = useState<string | null>(null);
  const cover = safeImageUrl(business.cover_url);
  const { data: owner } = useAsync(async () => {
    if (!business.owner_id) return null;
    const { data } = await supabase.from('profiles').select('full_name, email, phone').eq('id', business.owner_id).maybeSingle();
    return data as Pick<Profile, 'full_name' | 'email' | 'phone'> | null;
  }, [business.owner_id]);

  const apply = async (status: BusinessStatus) => {
    setBusy(status);
    const { error } = await supabase.rpc('admin_set_business_status', { p_business: business.id, p_status: status, p_verified: verified, p_featured: featured });
    setBusy(null);
    if (error) return toast(friendlyError(error), 'error');
    toast('İşletme güncellendi. Sahibine bildirim gönderildi.', 'success');
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={business.name}
      subtitle={`${business.categories?.name ?? ''} · ${business.district}, ${business.city}`}
      wide
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          {business.status === 'pending' && (
            <Button variant="danger" loading={busy === 'rejected'} onClick={() => apply('rejected')}>
              Reddet
            </Button>
          )}
          {business.status === 'approved' && (
            <Button variant="danger" loading={busy === 'suspended'} onClick={() => apply('suspended')}>
              Askıya al
            </Button>
          )}
          {business.status === 'approved' ? (
            <Button loading={busy === 'approved'} onClick={() => apply('approved')}>
              Kaydet
            </Button>
          ) : (
            <Button loading={busy === 'approved'} onClick={() => apply('approved')}>
              {business.status === 'pending' ? 'Onayla ve yayınla' : 'Yeniden yayınla'}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <BusinessStatusBadge status={business.status} />
          {business.status === 'approved' && (
            <Link to={`/i/${business.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300">
              Profili aç <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        {cover && <img src={cover} alt="" className="aspect-[16/6] w-full rounded-xl object-cover" />}
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Item label="İşletme sahibi" value={business.owner_id ? owner?.full_name || '—' : 'Örnek işletme (sahibi yok, randevuya kapalı)'} />
          <Item label="Sahip iletişim" value={owner ? [owner.email, owner.phone].filter(Boolean).join(' · ') : '—'} />
          <Item label="İşletme telefonu" value={business.phone || '—'} />
          <Item label="Adres" value={business.address} />
          <Item label="Kapora" value={business.deposit_type === 'percentage' ? `%${String(Number(business.deposit_value)).replace('.', ',')}` : formatTRY(business.deposit_value)} />
          <Item label="Ücretsiz iptal" value={`${business.cancellation_hours} saat öncesine kadar`} />
          <Item label="Puan" value={`${Number(business.rating_avg).toFixed(1)} (${business.review_count})`} />
          <Item label="Randevu sayısı" value={String(business.booking_count)} />
        </dl>
        <PayoutReview businessId={business.id} />
        {business.description && <p className="text-sm leading-relaxed text-mist">{business.description}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle checked={verified} onChange={setVerified} label="Doğrulanmış işletme" description="Profilde doğrulama rozeti gösterilir." />
          <Toggle checked={featured} onChange={setFeatured} label="Öne çıkan" description="Ana sayfada öne çıkanlar arasında yer alır." />
        </div>
      </div>
    </Modal>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-mist-2">{label}</dt>
      <dd className="mt-0.5 text-white">{value}</dd>
    </div>
  );
}
