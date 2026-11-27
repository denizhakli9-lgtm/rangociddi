import { useState, type FormEvent } from 'react';
import { Clock, Pencil, Plus, Scissors, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { depositFor, formatDuration, formatTRY } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Service } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';
import { parseTrNumber } from './number';

interface Draft {
  id?: string;
  name: string;
  description: string;
  price: string;
  duration_minutes: string;
  is_active: boolean;
}

const EMPTY: Draft = { name: '', description: '', price: '', duration_minutes: '45', is_active: true };

export default function Services() {
  const { business, reload: reloadBusiness } = useOwnerBusiness();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('services').select('*').eq('business_id', business.id).order('sort_order').order('created_at');
    if (err) throw err;
    return (rows ?? []) as Service[];
  }, [business.id]);

  const afterChange = () => {
    reload();
    reloadBusiness();
  };

  const toggleActive = async (s: Service) => {
    const { error: err } = await supabase.from('services').update({ is_active: !s.is_active }).eq('id', s.id);
    if (err) return toast(friendlyError(err), 'error');
    toast(s.is_active ? 'Hizmet randevuya kapatıldı.' : 'Hizmet tekrar yayında.', 'success');
    afterChange();
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const { error: err } = await supabase.from('services').delete().eq('id', removing.id);
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast('Hizmet silindi.', 'success');
    setRemoving(null);
    afterChange();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Hizmetler"
        title="Hizmet menünüz"
        text="Fiyat ve süreler müşteri uygulamasında anında güncellenir. Kapora, işletme profilinizdeki ayara göre hesaplanır."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDraft({ ...EMPTY })}>
            Hizmet ekle
          </Button>
        }
      />

      {loading && !data ? (
        <SkeletonList count={4} className="h-20" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState
          icon={<Scissors className="h-6 w-6" />}
          title="Henüz hizmet eklemediniz"
          text="Müşterilerin randevu alabilmesi için en az bir hizmet tanımlayın."
          action={<Button onClick={() => setDraft({ ...EMPTY })}>İlk hizmeti ekle</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((s) => (
            <div key={s.id} className={`card flex flex-col gap-4 p-5 transition hover:border-white/30 ${s.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-white">{s.name}</p>
                  {s.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-mist-2">{s.description}</p>}
                </div>
                <p className="shrink-0 font-display text-xl text-gold-300">{formatTRY(s.price)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-mist-2">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {formatDuration(s.duration_minutes)}
                </span>
                <span>· Kapora {formatTRY(depositFor(Number(s.price), business.deposit_type, Number(business.deposit_value)))}</span>
                {!s.is_active && <Badge>Pasif</Badge>}
              </div>
              <div className="flex gap-2 border-t border-line-soft pt-3">
                <Button
                  size="sm"
                  variant="dark"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => setDraft({ id: s.id, name: s.name, description: s.description, price: String(s.price), duration_minutes: String(s.duration_minutes), is_active: s.is_active })}
                >
                  Düzenle
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(s)}>
                  {s.is_active ? 'Pasif yap' : 'Aktif yap'}
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto text-error-300" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRemoving(s)} aria-label="Sil" />
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && <ServiceModal key={draft.id ?? 'new'} draft={draft} businessId={business.id} sortOrder={data?.length ?? 0} onClose={() => setDraft(null)} onSaved={() => { setDraft(null); afterChange(); }} />}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Hizmet silinsin mi?"
        subtitle={removing?.name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Sil
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-mist">Geçmiş randevu kayıtları korunur. Hizmeti yalnızca geçici olarak kapatmak istiyorsanız “Pasif yap” seçeneğini kullanın.</p>
      </Modal>
    </div>
  );
}

function ServiceModal({ draft, businessId, sortOrder, onClose, onSaved }: { draft: Draft; businessId: string; sortOrder: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<Draft>(draft);
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = useState(false);
  const parsedPrice = parseTrNumber(form.price);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const price = parseTrNumber(form.price) ?? NaN;
    const duration = Number(form.duration_minutes);
    const v: typeof errors = {};
    if (form.name.trim().length < 2) v.name = 'Hizmet adı en az 2 karakter olmalıdır.';
    if (!(price > 0 && price <= 1000000)) v.price = 'Geçerli bir fiyat girin.';
    if (!(Number.isInteger(duration) && duration >= 5 && duration <= 600)) v.duration_minutes = '5 ile 600 dakika arasında bir süre girin.';
    setErrors(v);
    if (Object.keys(v).length) return;
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description.trim(), price, duration_minutes: duration, is_active: form.is_active };
    const { error } = form.id
      ? await supabase.from('services').update(payload).eq('id', form.id)
      : await supabase.from('services').insert({ ...payload, business_id: businessId, sort_order: sortOrder });
    setSaving(false);
    if (error) return toast(friendlyError(error), 'error');
    toast(form.id ? 'Hizmet güncellendi.' : 'Hizmet eklendi.', 'success');
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? 'Hizmeti düzenle' : 'Yeni hizmet'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="service-form" loading={saving}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Input label="Hizmet adı" value={form.name} error={errors.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ör. Fön & Şekillendirme" />
        </div>
        <Input
          label="Fiyat (₺, KDV dahil)"
          inputMode="decimal"
          value={form.price}
          error={errors.price}
          hint={parsedPrice != null ? `Kaydedilecek: ${formatTRY(parsedPrice)}` : 'ör. 750 veya 1.250,50'}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
          placeholder="750"
        />
        <Input label="Süre (dakika)" inputMode="numeric" value={form.duration_minutes} error={errors.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value.replace(/\D/g, '') })} />
        <div className="sm:col-span-2">
          <Textarea label="Açıklama" value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Hizmetin içeriği, kullanılan ürünler vb." />
        </div>
        <div className="sm:col-span-2">
          <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Randevuya açık" description="Kapalı hizmetler müşterilere gösterilmez." />
        </div>
      </form>
    </Modal>
  );
}
