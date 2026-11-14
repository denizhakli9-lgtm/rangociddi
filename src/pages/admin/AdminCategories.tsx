import { useState } from 'react';
import { Plus, Pencil, Trash2, LayoutGrid } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { fetchCategories } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import { CategoryIcon, CATEGORY_ICON_OPTIONS } from '@/components/CategoryIcon';
import type { Category } from '@/lib/types';

type Form = Omit<Category, 'id'>;
const EMPTY: Form = { slug: '', name: '', description: '', icon: 'sparkles', image_url: null, sort_order: 0, is_active: true };

function CategoryModal({ initial, onClose, onSaved }: { initial: Category | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<Form>(initial ? { ...initial } : EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const e: Record<string, string> = {};
    const name = form.name.trim();
    const slug = form.slug.trim().toLowerCase();
    if (name.length < 2 || name.length > 60) e.name = 'Ad 2-60 karakter olmalı.';
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) e.slug = 'Yalnızca küçük harf, rakam ve tire (2-40).';
    if (form.image_url && !/^https:\/\//.test(form.image_url.trim())) e.image_url = 'Görsel adresi https:// ile başlamalı.';
    if (!Number.isInteger(form.sort_order) || form.sort_order < 0 || form.sort_order > 999) e.sort_order = '0-999 arası bir sayı girin.';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const payload = { ...form, name, slug, description: form.description.trim(), image_url: form.image_url?.trim() || null };
    const { error } = initial ? await supabase.from('categories').update(payload).eq('id', initial.id) : await supabase.from('categories').insert(payload);
    setSaving(false);
    if (error) return toast(error.code === '23505' ? 'Bu kısa ad zaten kullanılıyor.' : friendlyError(error), 'error');
    toast(initial ? 'Kategori güncellendi.' : 'Kategori eklendi.', 'success');
    onSaved();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? 'Kategoriyi düzenle' : 'Yeni kategori'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button loading={saving} onClick={save}>
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Ad" value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Kısa ad (URL)" value={form.slug} error={errors.slug} onChange={(e) => set('slug', e.target.value)} placeholder="ornek-kategori" />
        </div>
        <Textarea label="Açıklama" value={form.description} maxLength={300} onChange={(e) => set('description', e.target.value)} />
        <div>
          <p className="mb-2 text-sm text-mist">Simge</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_ICON_OPTIONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => set('icon', ic)}
                aria-label={ic}
                className={`grid h-11 w-11 place-items-center rounded-xl border transition ${form.icon === ic ? 'border-gold-400 bg-gold-400/10 text-gold-300' : 'border-line text-mist hover:border-gold-400/40'}`}
              >
                <CategoryIcon name={ic} />
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Input label="Görsel adresi (isteğe bağlı)" value={form.image_url ?? ''} error={errors.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="https://" />
          <Input label="Sıra" type="number" value={String(form.sort_order)} error={errors.sort_order} onChange={(e) => set('sort_order', Number(e.target.value))} />
        </div>
        <Toggle checked={form.is_active} onChange={(v) => set('is_active', v)} label="Aktif" description="Pasif kategoriler müşterilere gösterilmez." />
      </div>
    </Modal>
  );
}

export default function AdminCategories() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useAsync(() => fetchCategories(true), []);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const { error: err } = await supabase.from('categories').delete().eq('id', removing.id);
    setBusy(false);
    if (err) return toast(err.code === '23503' ? 'Bu kategoride işletmeler var. Silmek yerine pasif yapın.' : friendlyError(err), 'error');
    toast('Kategori silindi.', 'success');
    setRemoving(null);
    reload();
  };

  return (
    <div>
      <PageHeader
        eyebrow="Kategoriler"
        title="Hizmet kategorileri"
        text="Ana sayfada ve aramada görünen kategorileri yönetin."
        action={
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Yeni kategori
          </Button>
        }
      />
      {loading && !data ? (
        <SkeletonList count={4} className="h-20" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !data?.length ? (
        <EmptyState icon={<LayoutGrid className="h-6 w-6" />} title="Henüz kategori yok" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((c) => (
            <div key={c.id} className={`card flex items-center gap-4 p-4 ${c.is_active ? '' : 'opacity-60'}`}>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-gold-400/30 bg-gold-400/5 text-gold-300">
                <CategoryIcon name={c.icon} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium text-white">
                  {c.name} {!c.is_active && <Badge tone="neutral">Pasif</Badge>}
                </p>
                <p className="truncate text-xs text-mist-2">
                  /{c.slug} · sıra {c.sort_order}
                </p>
              </div>
              <button onClick={() => setEditing(c)} className="rounded-lg p-2 text-mist transition hover:bg-white/5 hover:text-gold-300" aria-label="Düzenle">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => setRemoving(c)} className="rounded-lg p-2 text-mist transition hover:bg-white/5 hover:text-red-400" aria-label="Sil">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CategoryModal
          key={editing === 'new' ? 'new' : editing.id}
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Kategoriyi sil"
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
        <p className="text-sm text-mist">Bu işlem geri alınamaz. İşletmeler bu kategoriyi kullanıyorsa silme engellenir.</p>
      </Modal>
    </div>
  );
}
