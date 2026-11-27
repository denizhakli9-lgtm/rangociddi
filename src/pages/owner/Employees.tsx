import { useRef, useState, type FormEvent } from 'react';
import { Camera, Check, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Toggle } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { Spinner, EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Employee, Service } from '@/lib/types';
import { useOwnerBusiness } from './OwnerContext';
import { useImageUpload } from './useImageUpload';

interface Draft {
  id?: string;
  full_name: string;
  title: string;
  bio: string;
  avatar_url: string | null;
  is_active: boolean;
  services: string[];
}

export default function Employees() {
  const { business } = useOwnerBusiness();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync(async () => {
    const [emps, svcs] = await Promise.all([
      supabase.from('employees').select('*, employee_services(service_id)').eq('business_id', business.id).order('sort_order').order('created_at'),
      supabase.from('services').select('*').eq('business_id', business.id).order('sort_order'),
    ]);
    if (emps.error) throw emps.error;
    if (svcs.error) throw svcs.error;
    return { employees: (emps.data ?? []) as Employee[], services: (svcs.data ?? []) as Service[] };
  }, [business.id]);

  const newDraft = (): Draft => ({ full_name: '', title: '', bio: '', avatar_url: null, is_active: true, services: (data?.services ?? []).map((s) => s.id) });

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    const { error: err } = await supabase.from('employees').update({ is_active: false }).eq('id', removing.id);
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    toast(`${removing.full_name} artık randevu almıyor.`, 'success');
    setRemoving(null);
    reload();
  };

  const serviceName = (id: string) => data?.services.find((s) => s.id === id)?.name;

  return (
    <div>
      <PageHeader
        eyebrow="Ekip"
        title="Çalışanlar"
        text="Her uzmanın hangi hizmetleri verdiğini belirleyin. Müşteriler randevu alırken uzman seçebilir ya da size bırakabilir."
        action={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDraft(newDraft())} disabled={!data}>
            Çalışan ekle
          </Button>
        }
      />

      {loading && !data ? (
        <SkeletonList count={3} className="h-32" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !data?.employees.length ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Ekibinizi ekleyin" text="Randevular uzman takvimlerine göre oluşturulur. En az bir çalışan gereklidir." action={<Button onClick={() => setDraft(newDraft())}>İlk çalışanı ekle</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.employees.map((emp) => {
            const ids = (emp.employee_services ?? []).map((x) => x.service_id);
            return (
              <div key={emp.id} className={`card flex flex-col gap-4 p-5 transition hover:border-white/30 ${emp.is_active ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={emp.full_name} src={emp.avatar_url} size="h-14 w-14 text-base" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{emp.full_name}</p>
                    <p className="truncate text-xs text-mist-2">{emp.title || 'Uzman'}</p>
                  </div>
                  {!emp.is_active && <Badge>Pasif</Badge>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ids.length ? (
                    ids.slice(0, 4).map((id) => (
                      <span key={id} className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-mist">
                        {serviceName(id)}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-warning-300">Hizmet atanmadı</span>
                  )}
                  {ids.length > 4 && <span className="text-[11px] text-mist-2">+{ids.length - 4}</span>}
                </div>
                <div className="mt-auto flex gap-2 border-t border-line-soft pt-3">
                  <Button
                    size="sm"
                    variant="dark"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => setDraft({ id: emp.id, full_name: emp.full_name, title: emp.title, bio: emp.bio, avatar_url: emp.avatar_url, is_active: emp.is_active, services: ids })}
                  >
                    Düzenle
                  </Button>
                  {emp.is_active && (
                    <Button size="sm" variant="ghost" className="ml-auto text-error-300" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setRemoving(emp)}>
                      Kaldır
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && data && (
        <EmployeeModal
          key={draft.id ?? 'new'}
          draft={draft}
          services={data.services}
          sortOrder={data.employees.length}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setDraft(null);
            reload();
          }}
        />
      )}

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Çalışan kaldırılsın mı?"
        subtitle={removing?.full_name}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} onClick={remove}>
              Kaldır
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-mist">Çalışan yeni randevu almaz ve müşterilere gösterilmez. Mevcut randevuları ve geçmiş kayıtlar korunur; gerekiyorsa randevuları ayrıca iptal edin.</p>
      </Modal>
    </div>
  );
}

function EmployeeModal({ draft, services, sortOrder, onClose, onSaved }: { draft: Draft; services: Service[]; sortOrder: number; onClose: () => void; onSaved: () => void }) {
  const { business } = useOwnerBusiness();
  const { toast } = useToast();
  const { upload, uploading } = useImageUpload(business.id);
  const [form, setForm] = useState<Draft>(draft);
  const [nameErr, setNameErr] = useState('');
  const [saving, setSaving] = useState(false);
  // Service links already stored in the database. A new employee starts with none; the ref is
  // updated after every successful write so a retry after a partial failure only sends what is missing.
  const persistedServices = useRef<string[]>(draft.id ? draft.services : []);

  const toggleService = (id: string) =>
    setForm((f) => ({ ...f, services: f.services.includes(id) ? f.services.filter((x) => x !== id) : [...f.services, id] }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.full_name.trim().length < 2) {
      setNameErr('Ad soyad en az 2 karakter olmalıdır.');
      return;
    }
    setNameErr('');
    setSaving(true);
    try {
      const payload = { full_name: form.full_name.trim(), title: form.title.trim(), bio: form.bio.trim(), avatar_url: form.avatar_url, is_active: form.is_active };
      let id = form.id;
      if (id) {
        const { error } = await supabase.from('employees').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('employees').insert({ ...payload, business_id: business.id, sort_order: sortOrder }).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new Error('insert returned nothing');
        const newId = data.id as string;
        id = newId;
        // Remember the created row at once: if a later step fails, "Kaydet" updates it instead of inserting a duplicate.
        setForm((f) => ({ ...f, id: newId }));
      }
      const before = new Set(persistedServices.current);
      const after = new Set(form.services);
      const added = form.services.filter((s) => !before.has(s));
      const removed = persistedServices.current.filter((s) => !after.has(s));
      if (added.length) {
        const { error } = await supabase
          .from('employee_services')
          .upsert(added.map((service_id) => ({ employee_id: id, service_id })), { onConflict: 'employee_id,service_id', ignoreDuplicates: true });
        if (error) throw error;
        persistedServices.current = [...persistedServices.current, ...added];
      }
      if (removed.length) {
        const { error } = await supabase.from('employee_services').delete().eq('employee_id', id).in('service_id', removed);
        if (error) throw error;
        persistedServices.current = persistedServices.current.filter((s) => !removed.includes(s));
      }
      toast(draft.id ? 'Çalışan güncellendi.' : 'Çalışan eklendi.', 'success');
      onSaved();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={form.id ? 'Çalışanı düzenle' : 'Yeni çalışan'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" form="employee-form" loading={saving}>
            Kaydet
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={submit} className="space-y-5" noValidate>
        <div className="flex items-center gap-4">
          <label className="group relative cursor-pointer">
            <Avatar name={form.full_name || 'Yeni'} src={form.avatar_url} size="h-20 w-20 text-xl" />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-ink/60 opacity-0 transition group-hover:opacity-100">
              {uploading ? <Spinner className="h-5 w-5" /> : <Camera className="h-5 w-5 text-white" />}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={async (e) => {
                const url = await upload(e.target.files?.[0], 'staff');
                if (url) setForm((f) => ({ ...f, avatar_url: url }));
                e.target.value = '';
              }}
            />
          </label>
          <div className="text-xs leading-relaxed text-mist-2">Profil fotoğrafı yüklemek için görsele dokunun. JPG, PNG veya WebP, en fazla 5 MB.</div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Ad soyad" value={form.full_name} error={nameErr} maxLength={120} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input label="Unvan" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ör. Kıdemli Kuaför" />
        </div>
        <Textarea label="Kısa biyografi" value={form.bio} maxLength={500} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-mist">Verdiği hizmetler</p>
          {services.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {services.map((s) => {
                const on = form.services.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm transition ${on ? 'border-gold-500/60 bg-gold-500/10 text-white' : 'border-line text-mist hover:border-white/30'}`}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${on ? 'border-gold-500 bg-primary text-primary-fg' : 'border-line'}`}>{on && <Check className="h-3 w-3" />}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-mist-2">Önce hizmet ekleyin, ardından çalışanlara atayın.</p>
          )}
        </div>
        <Toggle checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} label="Randevu alıyor" description="Kapalıyken müşteriler bu çalışanı seçemez." />
      </form>
    </Modal>
  );
}
