import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ExternalLink, Mail, Phone, Search, Store, X } from 'lucide-react';
import { Segmented } from '@/components/ui/Brand';
import { Button } from '@/components/ui/Button';
import { Badge, BusinessStatusBadge } from '@/components/ui/Badge';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import { useToast } from '@/contexts/ToastContext';
import { friendlyError } from '@/lib/errors';
import { formatDate, formatTRY } from '@/lib/format';
import { fieldAgentSetBusinessStatus, setupGaps, type FieldAgentBusiness } from '@/lib/fieldAgent';
import { isReservedEmail } from '@/lib/phoneLogin';
import type { BusinessStatus } from '@/lib/types';
import { useField } from './FieldContext';

type Tab = 'all' | BusinessStatus;

const BONUS_LABEL = { pending: 'Prim bekliyor', paid: 'Prim ödendi', cancelled: 'Prim iptal' } as const;

export default function FieldBusinesses() {
  const { businesses, loading, error, reload } = useField();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('pending');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<FieldAgentBusiness | null>(null);
  const [reason, setReason] = useState('');

  const count = (s: Tab) => (businesses ?? []).filter((b) => s === 'all' || b.status === s).length;
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return (businesses ?? []).filter(
      (b) =>
        (tab === 'all' || b.status === tab) &&
        (!q || b.name.toLocaleLowerCase('tr-TR').includes(q) || b.district.toLocaleLowerCase('tr-TR').includes(q) || (b.owner_name ?? '').toLocaleLowerCase('tr-TR').includes(q)),
    );
  }, [businesses, tab, query]);

  const decide = async (b: FieldAgentBusiness, status: 'approved' | 'rejected', note = '') => {
    setBusy(`${b.id}:${status}`);
    try {
      await fieldAgentSetBusinessStatus(b.id, status, note);
      toast(status === 'approved' ? `${b.name} onaylandı ve yayına alındı.` : `${b.name} başvurusu reddedildi.`, 'success');
      setRejecting(null);
      setReason('');
      await reload();
    } catch (e) {
      toast(friendlyError(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader eyebrow="İşletmelerim" title="Getirdiğim işletmeler" text="Başvuruları kontrol edip onaylayın; eksik kurulumu olan işletmelere ulaşıp yardımcı olun." />
      <div className="mb-4 overflow-x-auto no-scrollbar">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pending', label: 'Bekleyen', count: count('pending') },
            { value: 'approved', label: 'Yayında', count: count('approved') },
            { value: 'rejected', label: 'Reddedilen', count: count('rejected') },
            { value: 'all', label: 'Tümü', count: count('all') },
          ]}
        />
      </div>
      <div className="mb-6 max-w-md">
        <Input aria-label="İşletme ara" placeholder="İşletme, ilçe veya sahip adı" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
      </div>

      {loading && !businesses ? (
        <SkeletonList count={3} className="h-40" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState
          icon={<Store className="h-6 w-6" />}
          title="Bu listede işletme yok"
          text={businesses?.length ? undefined : 'Referans kodunuzla kaydolan işletmeler burada görünür.'}
        />
      ) : (
        <div className="space-y-4">
          {list.map((b) => {
            const gaps = setupGaps(b);
            // A rejection can be reopened only by the agent who made it (an admin's rejection stays).
            const canDecide = b.status === 'pending' || (b.status === 'rejected' && !!b.rejected_by_me);
            return (
              <article key={b.id} className="card overflow-hidden">
                <div className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-white">{b.name}</p>
                      <p className="text-xs text-mist-2">
                        {b.district} · kayıt {formatDate(b.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {b.bonus && (
                        <Badge tone={b.bonus.status === 'paid' ? 'success' : b.bonus.status === 'cancelled' ? 'neutral' : 'gold'}>
                          {BONUS_LABEL[b.bonus.status]} · {formatTRY(b.bonus.amount)}
                        </Badge>
                      )}
                      <BusinessStatusBadge status={b.status} />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist">
                    <span className="text-white">{b.owner_name ?? 'İşletme sahibi'}</span>
                    {(b.owner_phone || b.phone) && (
                      <a href={`tel:${b.owner_phone || b.phone}`} className="inline-flex items-center gap-1 hover:text-gold-300">
                        <Phone className="h-3 w-3" /> {b.owner_phone || b.phone}
                      </a>
                    )}
                    {/* Owners who signed up by phone have no e-mail; their phone above is the contact. */}
                    {b.owner_email && !isReservedEmail(b.owner_email) && (
                      <a href={`mailto:${b.owner_email}`} className="inline-flex min-w-0 items-center gap-1 truncate hover:text-gold-300">
                        <Mail className="h-3 w-3" /> {b.owner_email}
                      </a>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {gaps.length ? (
                      <>
                        <span className="text-mist-2">Eksik:</span>
                        {gaps.map((g) => (
                          <span key={g} className="rounded-full border border-warning-500/30 bg-warning-500/10 px-2 py-0.5 text-warning-300">
                            {g}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span className="text-success-300">Kurulum tamam</span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-mist-2">
                    {b.services} hizmet · {b.employees} çalışan · {b.booking_count} randevu · {b.completed_appointments} tamamlanan
                    {b.review_count > 0 && ` · ${b.rating_avg.toFixed(1)} puan`}
                  </p>
                </div>

                {(canDecide || b.status === 'approved') && (
                  <div className="flex flex-wrap gap-2 border-t border-line bg-ink/30 px-4 py-3 sm:px-5">
                    {b.status === 'approved' && (
                      <Link to={`/i/${b.slug}`} target="_blank" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line px-4 text-xs text-white transition hover:border-white/30">
                        <ExternalLink className="h-3.5 w-3.5 text-gold-400" /> Sayfayı gör
                      </Link>
                    )}
                    {canDecide && (
                      <>
                        {b.status === 'pending' && (
                          <Button size="sm" variant="danger" icon={<X className="h-3.5 w-3.5" />} onClick={() => setRejecting(b)}>
                            Reddet
                          </Button>
                        )}
                        <Button size="sm" loading={busy === `${b.id}:approved`} icon={<Check className="h-3.5 w-3.5" />} onClick={() => decide(b, 'approved')}>
                          Onayla ve yayına al
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Başvuruyu reddet"
        subtitle={rejecting?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={!!rejecting && busy === `${rejecting.id}:rejected`} onClick={() => rejecting && decide(rejecting, 'rejected', reason.trim())}>
              Reddet
            </Button>
          </>
        }
      >
        <Textarea
          label="Neden (işletme sahibine iletilir)"
          value={reason}
          maxLength={500}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ör. Adres ve çalışma saatleri eksik; tamamlandığında tekrar onaylayacağım."
        />
        <p className="mt-2 text-xs text-mist-2">Sizin reddettiğiniz başvuruyu eksikler tamamlanınca buradan tekrar onaylayabilirsiniz.</p>
      </Modal>
    </div>
  );
}
