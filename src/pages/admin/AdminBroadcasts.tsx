import { useMemo, useState } from 'react';
import { Check, Megaphone, Search, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { friendlyError } from '@/lib/errors';
import { formatRelative } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { Badge, BusinessStatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { BusinessStatus } from '@/lib/types';

type Audience = 'all' | 'approved' | 'pending' | 'selected';

interface Target {
  id: string;
  name: string;
  district: string;
  status: BusinessStatus;
  owner_id: string | null;
}

interface Broadcast {
  id: string;
  audience: Audience;
  title: string;
  body: string;
  link: string | null;
  recipient_count: number;
  created_at: string;
}

const AUDIENCES: { value: Audience; label: string; text: string }[] = [
  { value: 'all', label: 'Tüm işletmeler', text: 'Hesabı olan her işletme sahibi' },
  { value: 'approved', label: 'Onaylı işletmeler', text: 'Yayında olan işletmeler' },
  { value: 'pending', label: 'Onay bekleyenler', text: 'Başvurusu incelenen işletmeler' },
  { value: 'selected', label: 'Seçtiklerim', text: 'Listeden tek tek seçin' },
];

const AUDIENCE_LABEL: Record<Audience, string> = { all: 'Tüm işletmeler', approved: 'Onaylı işletmeler', pending: 'Onay bekleyenler', selected: 'Seçilen işletmeler' };

// Where the notification takes the owner when they tap it. Must match the server-side check.
const LINKS = [
  { value: '/isletme', label: 'Panel (ana sayfa)' },
  { value: '/isletme/randevular', label: 'Randevular' },
  { value: '/isletme/takvim', label: 'Takvim' },
  { value: '/isletme/hizmetler', label: 'Hizmetler' },
  { value: '/isletme/calisanlar', label: 'Çalışanlar' },
  { value: '/isletme/saatler', label: 'Çalışma saatleri' },
  { value: '/isletme/kazanc', label: 'Kazanç & Komisyon' },
  { value: '/isletme/profil', label: 'İşletme profili' },
  { value: '/destek', label: 'Yardım ve Destek' },
];

const TITLE_MAX = 80;
const BODY_MAX = 500;

export default function AdminBroadcasts() {
  const { toast } = useToast();
  const [audience, setAudience] = useState<Audience>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('/isletme');
  const [errors, setErrors] = useState<{ title?: string; audience?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  const targets = useAsync(async () => {
    const { data, error } = await supabase.from('businesses').select('id, name, district, status, owner_id').order('name');
    if (error) throw error;
    // Sample listings have no owner account, so there is nobody to notify.
    return ((data ?? []) as Target[]).filter((b) => b.owner_id);
  }, []);

  const history = useAsync(async () => {
    const { data, error } = await supabase.from('admin_broadcasts').select('id, audience, title, body, link, recipient_count, created_at').order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    return (data ?? []) as Broadcast[];
  }, []);

  const all = useMemo(() => targets.data ?? [], [targets.data]);
  const recipients = useMemo(() => {
    if (audience === 'all') return all;
    if (audience === 'selected') return all.filter((b) => selected.has(b.id));
    return all.filter((b) => b.status === audience);
  }, [all, audience, selected]);
  const countFor = (a: Audience) => (a === 'all' ? all.length : a === 'selected' ? selected.size : all.filter((b) => b.status === a).length);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return all.filter((b) => !q || b.name.toLocaleLowerCase('tr-TR').includes(q) || b.district.toLocaleLowerCase('tr-TR').includes(q));
  }, [all, query]);

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setErrors((e) => ({ ...e, audience: undefined }));
  };

  const review = () => {
    const e: typeof errors = {};
    if (title.trim().length < 3) e.title = 'Başlık en az 3 karakter olmalı.';
    if (!recipients.length) e.audience = audience === 'selected' ? 'En az bir işletme seçin.' : 'Bu grupta bildirim gönderilecek işletme yok.';
    setErrors(e);
    if (!Object.keys(e).length) setConfirming(true);
  };

  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.rpc('admin_notify_businesses', {
      p_audience: audience,
      p_business_ids: audience === 'selected' ? [...selected] : [],
      p_title: title.trim(),
      p_body: body.trim(),
      p_link: link,
    });
    setSending(false);
    if (error) return toast(friendlyError(error), 'error');
    setConfirming(false);
    toast(`Bildirim ${Number(data)} işletme sahibine gönderildi.`, 'success');
    setTitle('');
    setBody('');
    setSelected(new Set());
    history.reload();
  };

  return (
    <div>
      <PageHeader eyebrow="Bildirimler" title="İşletmelere bildirim gönder" text="Duyuru, hatırlatma veya bilgilendirme yazın; işletme sahipleri panellerindeki zil simgesinde anında görür." />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card space-y-6 p-6">
          <div>
            <p className="mb-3 text-sm font-medium text-white">1. Kime gönderilsin?</p>
            {targets.loading && !targets.data ? (
              <SkeletonList count={2} className="h-16" />
            ) : targets.error ? (
              <ErrorState onRetry={targets.reload} />
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Alıcılar">
                  {AUDIENCES.map((a) => {
                    const active = audience === a.value;
                    return (
                      <button
                        key={a.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => {
                          setAudience(a.value);
                          setErrors((e) => ({ ...e, audience: undefined }));
                        }}
                        className={`rounded-2xl border p-4 text-left transition ${active ? 'border-gold-500/70 bg-gold-500/10' : 'border-line bg-ink/40 hover:border-gold-500/30'}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white">{a.label}</span>
                          <Badge tone={active ? 'gold' : 'neutral'}>{countFor(a.value)}</Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-mist-2">{a.text}</span>
                      </button>
                    );
                  })}
                </div>

                {audience === 'selected' && (
                  <div className="mt-4">
                    <Input aria-label="İşletme ara" placeholder="İşletme adı veya ilçe" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-2xl border border-line p-2">
                      {filtered.map((b) => {
                        const on = selected.has(b.id);
                        return (
                          <li key={b.id}>
                            <button type="button" role="checkbox" aria-checked={on} onClick={() => toggle(b.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${on ? 'bg-gold-500/10' : 'hover:bg-white/5'}`}>
                              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${on ? 'border-gold-500 bg-gold-500 text-ink' : 'border-line'}`}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm text-white">{b.name}</span>
                                <span className="block text-xs text-mist-2">{b.district}</span>
                              </span>
                              <BusinessStatusBadge status={b.status} />
                            </button>
                          </li>
                        );
                      })}
                      {!filtered.length && <li className="px-3 py-4 text-center text-xs text-mist-2">Eşleşen işletme yok.</li>}
                    </ul>
                  </div>
                )}
                {errors.audience && <p className="mt-2 text-xs text-error-300" role="alert">{errors.audience}</p>}
              </>
            )}
          </div>

          <div className="space-y-4 border-t border-line pt-6">
            <p className="text-sm font-medium text-white">2. Ne yazsın?</p>
            <Input
              label="Başlık"
              name="title"
              value={title}
              error={errors.title}
              hint={`${title.length}/${TITLE_MAX} · Kısa ve net olsun.`}
              maxLength={TITLE_MAX}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((x) => ({ ...x, title: undefined }));
              }}
              placeholder="ör. Bayram haftası çalışma saatlerinizi güncelleyin"
            />
            <Textarea label="Mesaj (isteğe bağlı)" name="body" value={body} hint={`${body.length}/${BODY_MAX}`} maxLength={BODY_MAX} onChange={(e) => setBody(e.target.value)} placeholder="Ayrıntıları bir iki cümleyle yazın." />
            <Select label="Dokununca açılacak sayfa" name="link" value={link} onChange={(e) => setLink(e.target.value)}>
              {LINKS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>

          <Button size="lg" full onClick={review} icon={<Send className="h-4 w-4" />} disabled={targets.loading || !!targets.error}>
            {recipients.length ? `${recipients.length} işletmeye gönder` : 'Gönder'}
          </Button>
        </section>

        <div className="space-y-6">
          <section>
            <p className="eyebrow mb-3">Önizleme</p>
            <Preview title={title} body={body} />
          </section>

          <section>
            <p className="eyebrow mb-3">Son gönderilenler</p>
            {history.loading && !history.data ? (
              <SkeletonList count={2} className="h-20" />
            ) : history.error ? (
              <ErrorState onRetry={history.reload} />
            ) : !history.data?.length ? (
              <EmptyState icon={<Megaphone className="h-6 w-6" />} title="Henüz bildirim gönderilmedi" text="Gönderdiğiniz bildirimler burada listelenir." />
            ) : (
              <ul className="space-y-2">
                {history.data.map((b) => (
                  <li key={b.id} className="card p-4">
                    <p className="text-sm font-semibold text-white">{b.title}</p>
                    {b.body && <p className="mt-0.5 line-clamp-2 text-sm text-mist">{b.body}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-mist-3">
                      <Badge>{AUDIENCE_LABEL[b.audience] ?? b.audience}</Badge>
                      {b.recipient_count} alıcı · {formatRelative(b.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={() => !sending && setConfirming(false)}
        title="Bildirim gönderilsin mi?"
        subtitle={`${AUDIENCE_LABEL[audience]} · ${recipients.length} işletme. Gönderilen bildirim geri alınamaz.`}
        footer={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setConfirming(false)}>
              Vazgeç
            </Button>
            <Button loading={sending} onClick={send} icon={<Send className="h-4 w-4" />}>
              Gönder
            </Button>
          </>
        }
      >
        <Preview title={title} body={body} />
      </Modal>
    </div>
  );
}

function Preview({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-gold-500/30 bg-gold-500/[0.04] p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold-500/40 text-gold-400">
        <Megaphone className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-semibold text-white">{title.trim() || 'Bildirim başlığı'}</span>
        <span className="mt-0.5 block whitespace-pre-line break-words text-sm text-mist">{body.trim() || 'Mesajınız burada görünecek.'}</span>
        <span className="mt-1 block text-xs text-mist-3">şimdi</span>
      </span>
    </div>
  );
}
