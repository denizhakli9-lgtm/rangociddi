import { useMemo, useState } from 'react';
import { Copy, KeyRound, MessageCircle, Phone, Search, Users } from 'lucide-react';
import { formatTrPhone } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { normalizeTrMobile } from '@/lib/phoneLogin';
import { systemLinkClick } from '@/lib/platform';
import { useT } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Avatar, Segmented } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Profile, Role } from '@/lib/types';

type Tab = 'all' | Role;

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** wa.me link to a Turkish mobile number ('05321234567' -> 905321234567) with a prefilled message; null if the number is not a mobile. */
function userWhatsAppUrl(phone: string, message: string): string | null {
  const n = normalizeTrMobile(phone);
  return n ? `https://wa.me/90${n}?text=${encodeURIComponent(message)}` : null;
}

export default function AdminUsers() {
  const t = useT();
  const { profile: me } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, loading, error, reload, setData } = useAsync(async () => {
    const { data: rows, error: err } = await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(1000);
    if (err) throw err;
    return (rows ?? []) as Profile[];
  }, []);
  // Accounts that sign in with a phone number (their login address lives only in auth.users).
  const { data: phoneIds } = useAsync(async () => {
    const { data: ids, error: err } = await supabase.rpc('admin_phone_login_users');
    if (err) throw err;
    return new Set((ids ?? []) as string[]);
  }, []);
  const [resetFor, setResetFor] = useState<Profile | null>(null);

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    // Phones are compared digits-only, so '05321234567', '0532 123 45 67' and '+90 532…' all match.
    let qd = digits(q);
    if (qd.length > 2 && qd.startsWith('90')) qd = `0${qd.slice(2)}`;
    return (data ?? []).filter(
      (p) =>
        (tab === 'all' || p.role === tab) &&
        (!q || (p.full_name ?? '').toLocaleLowerCase('tr-TR').includes(q) || (p.email ?? '').toLowerCase().includes(q) || (!!qd && digits(p.phone).includes(qd))),
    );
  }, [data, tab, query]);

  const toggle = async (p: Profile) => {
    setBusy(p.id);
    const { error: err } = await supabase.rpc('admin_set_user_suspended', { p_user: p.id, p_suspended: !p.is_suspended });
    setBusy(null);
    if (err) return toast(friendlyError(err), 'error');
    toast(p.is_suspended ? 'Hesap yeniden etkinleştirildi.' : 'Hesap askıya alındı.', 'success');
    setData((d) => (d ?? []).map((x) => (x.id === p.id ? { ...x, is_suspended: !p.is_suspended } : x)));
  };

  const count = (r: Tab) => (data ?? []).filter((p) => r === 'all' || p.role === r).length;

  return (
    <div>
      <PageHeader eyebrow="Kullanıcılar" title="Kullanıcı yönetimi" text="Askıya alınan hesaplar giriş yapabilir ancak randevu alamaz ve işlem yapamaz." />
      <div className="mb-4 overflow-x-auto no-scrollbar">
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'Tümü', count: count('all') },
            { value: 'customer', label: 'Müşteri', count: count('customer') },
            { value: 'business', label: 'İşletme', count: count('business') },
            { value: 'admin', label: 'Yönetici', count: count('admin') },
          ]}
        />
      </div>
      <div className="mb-6 max-w-md">
        <Input aria-label="Kullanıcı ara" placeholder="İsim, e-posta veya telefon" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
      </div>
      {loading && !data ? (
        <SkeletonList count={6} className="h-16" />
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="Kullanıcı bulunamadı" />
      ) : (
        <div className="card divide-y divide-line-soft overflow-hidden">
          {list.map((p) => (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4">
              <Avatar name={p.full_name || p.email || '?'} src={p.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-medium text-white">
                  {p.full_name || 'İsimsiz'}
                  {phoneIds?.has(p.id) && <Badge icon={<Phone className="h-3 w-3" />}>Telefonla giriş</Badge>}
                  {p.is_suspended && <Badge tone="error">Askıda</Badge>}
                </p>
                <p className="truncate text-xs text-mist-2">{[p.email, p.phone].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <div className="hidden text-right sm:block">
                <Badge tone={p.role === 'admin' ? 'gold' : p.role === 'business' ? 'info' : 'neutral'}>{t.role[p.role]}</Badge>
                <p className="mt-1 text-[11px] text-mist-2">{formatDate(p.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              {phoneIds?.has(p.id) && p.id !== me?.id && (
                <Button size="sm" variant="ghost" icon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setResetFor(p)}>
                  <span className="hidden md:inline">Geçici şifre oluştur</span>
                  <span className="md:hidden">Şifre</span>
                </Button>
              )}
              {p.role !== 'admin' && p.id !== me?.id && (
                <Button size="sm" variant={p.is_suspended ? 'outline' : 'danger'} loading={busy === p.id} onClick={() => toggle(p)}>
                  {p.is_suspended ? 'Etkinleştir' : 'Askıya al'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {resetFor && <TempPasswordModal key={resetFor.id} user={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

/**
 * Phone accounts cannot receive a reset e-mail (there is no SMS provider either), so an admin sets a
 * one-off temporary password and sends it to the registered number over WhatsApp.
 */
function TempPasswordModal({ user, onClose }: { user: Profile; onClose: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ password: string; phone: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    const { data, error: err } = await supabase.rpc('admin_reset_phone_password', { p_user: user.id });
    setBusy(false);
    if (err) return toast(friendlyError(err), 'error');
    setResult(data as { password: string; phone: string });
  };

  // The reset is already done on the server once the request starts: closing the dialog (Esc, backdrop, X)
  // while it runs or before the password was passed on would lose it, so ask first.
  const guardedClose = () => {
    if (busy) return;
    if (result && !window.confirm('Geçici şifreyi kopyaladınız veya gönderdiniz mi? Pencere kapanınca şifre tekrar gösterilmez.')) return;
    onClose();
  };

  const copy = async (pw: string) => {
    try {
      await navigator.clipboard.writeText(pw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Kopyalanamadı, şifreyi elle seçebilirsiniz.', 'error');
    }
  };

  const message = result
    ? `Rango işletme hesabınız için geçici şifreniz: ${result.password}. Giriş yaptıktan sonra Hesap ayarları > Şifre değiştir bölümünden yeni bir şifre belirleyin.`
    : '';
  const waUrl = result ? userWhatsAppUrl(result.phone, message) : null;
  const name = user.full_name || 'İsimsiz';

  return (
    <Modal
      open
      onClose={guardedClose}
      title="Geçici şifre oluştur"
      subtitle={`${name}${user.phone ? ` · ${user.phone}` : ''}`}
      footer={
        result ? (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={guardedClose}>
              Kapat
            </Button>
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={systemLinkClick(waUrl)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-5 text-sm font-semibold tracking-wide text-ink transition-all duration-200 hover:from-gold-300 hover:to-gold-500 active:scale-[0.98]"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp ile gönder
              </a>
            )}
          </div>
        ) : (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="danger" loading={busy} icon={<KeyRound className="h-4 w-4" />} onClick={create}>
              Geçici şifre oluştur
            </Button>
          </div>
        )
      }
    >
      {result ? (
        <div className="space-y-4 text-sm">
          <p className="text-mist">
            Geçici şifre oluşturuldu. Şifreyi yalnızca kayıtlı numaraya (<span className="text-white">{formatTrPhone(result.phone)}</span>) gönderin. Bu pencere kapandıktan sonra şifre tekrar gösterilmez.
          </p>
          <div className="flex items-center gap-2 rounded-xl border border-gold-500/30 bg-gold-500/5 px-4 py-3">
            <span className="flex-1 select-all break-all font-mono text-lg tracking-[0.15em] text-gold-300">{result.password}</span>
            <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={() => copy(result.password)}>
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </Button>
          </div>
          <p className="text-xs text-mist-2">Kullanıcı bu şifreyle telefon numarasıyla giriş yapar ve ardından Hesap ayarları &gt; Şifre değiştir bölümünden yeni bir şifre belirler.</p>
        </div>
      ) : (
        <div className="space-y-3 text-sm text-mist">
          <p>
            <span className="text-white">{name}</span> telefonla giriş yapan bir işletme hesabı; şifre sıfırlama e-postası alamaz. Yeni bir geçici şifre oluşturup WhatsApp üzerinden kayıtlı numaraya gönderebilirsiniz.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Mevcut şifre hemen geçersiz olur.</li>
            <li>Açık oturumlar yenilenemez; en geç 1 saat içinde tüm cihazlarda sona erer. Yeni giriş yalnızca geçici şifreyle yapılabilir.</li>
            <li>Şifreyi yalnızca, talebin kayıtlı numaradan geldiğini doğruladıktan sonra o numaraya gönderin.</li>
          </ul>
        </div>
      )}
    </Modal>
  );
}
