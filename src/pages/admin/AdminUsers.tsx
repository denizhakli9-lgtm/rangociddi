import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { formatDate } from '@/lib/format';
import { friendlyError } from '@/lib/errors';
import { useT } from '@/i18n/I18nProvider';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Avatar, Segmented } from '@/components/ui/Brand';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/layout/PageHeader';
import type { Profile, Role } from '@/lib/types';

type Tab = 'all' | Role;

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

  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    return (data ?? []).filter(
      (p) => (tab === 'all' || p.role === tab) && (!q || (p.full_name ?? '').toLocaleLowerCase('tr-TR').includes(q) || (p.email ?? '').toLowerCase().includes(q) || (p.phone ?? '').includes(q)),
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
        <Input placeholder="İsim, e-posta veya telefon" value={query} onChange={(e) => setQuery(e.target.value)} icon={<Search className="h-4 w-4" />} />
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
                  {p.is_suspended && <Badge tone="error">Askıda</Badge>}
                </p>
                <p className="truncate text-xs text-mist-2">
                  {p.email} {p.phone ? `· ${p.phone}` : ''}
                </p>
              </div>
              <div className="hidden text-right sm:block">
                <Badge tone={p.role === 'admin' ? 'gold' : p.role === 'business' ? 'info' : 'neutral'}>{t.role[p.role]}</Badge>
                <p className="mt-1 text-[11px] text-mist-2">{formatDate(p.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
              {p.role !== 'admin' && p.id !== me?.id && (
                <Button size="sm" variant={p.is_suspended ? 'outline' : 'danger'} loading={busy === p.id} onClick={() => toggle(p)}>
                  {p.is_suspended ? 'Etkinleştir' : 'Askıya al'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
