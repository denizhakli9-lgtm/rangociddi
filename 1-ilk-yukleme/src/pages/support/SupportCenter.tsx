import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState, PageLoader } from '@/components/ui/Feedback';
import { ThemeSelect } from '@/components/ui/ThemeSelect';
import { supportAction, supportLabels, type SupportThread } from '@/lib/support';
import SupportConversation from './SupportConversation';
import SupportSettings from './SupportSettings';

export default function SupportCenter({ workspace = false }: { workspace?: boolean }) {
  const { profile } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [filter, setFilter] = useState('all');
  const q = useAsync(async () => {
    const { data: agent, error: agentError } = await supabase.rpc('support_is_agent');
    if (agentError) throw agentError;
    if (workspace && !agent) return { allowed: false, threads: [], online: false };
    let query = supabase.from('support_threads').select('*').order('updated_at', { ascending: false }).limit(100);
    if (!workspace) query = query.eq('user_id', profile!.id);
    const [{ data, error }, config] = await Promise.all([query, supabase.from('support_config').select('id,live_online').eq('id', 1).maybeSingle()]);
    if (error || config.error) throw error || config.error;
    return { allowed: true, threads: (data ?? []) as SupportThread[], online: !!config.data?.live_online };
  }, [profile?.id, workspace]);
  useEffect(() => { const timer = window.setInterval(q.reload, 5000); return () => window.clearInterval(timer); }, [q.reload]);
  const create = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setFailure(false);
    try { setSelected(await supportAction('create', undefined, subject)); setSubject(''); await q.reload(); }
    catch { setFailure(true); } finally { setBusy(false); }
  };
  if (q.loading && !q.data) return <PageLoader />;
  if (q.error) return <ErrorState onRetry={q.reload} />;
  if (!q.data?.allowed) return <p className="card p-6 text-mist">Bu alan yalnızca yetkili destek ekibine açıktır.</p>;
  const thread = q.data.threads.find((t) => t.id === selected);
  return <div className="mx-auto max-w-6xl space-y-6">
    <div><p className="eyebrow">Rango</p><h1 className="mt-2 font-display text-4xl text-white">{workspace ? 'Destek Merkezi' : 'Yardım ve Destek'}</h1><p className="mt-2 text-sm text-mist">{q.data.online ? 'Canlı destek ekibi çevrimiçi.' : 'Canlı destek şu anda çevrimdışı. Mesajın kaydedilir; ekibimiz döndüğünde yanıtlar.'}</p></div>
    {workspace && <Link to="/profil" className="inline-flex min-h-11 items-center text-xs text-gold-500">Profilime dön</Link>}
    {!workspace && <Link to="/yonetim/destek-ekibi" className="inline-flex min-h-11 items-center text-xs text-gold-500">Destek görevlisi girişi</Link>}
    {workspace && profile?.role === 'admin' && <SupportSettings online={q.data.online} reload={q.reload} />}
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        {workspace ? <select aria-label="Konuşma durumu" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Tüm konuşmalar</option>{Object.entries(supportLabels).map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select> : <form onSubmit={create} className="card space-y-3 p-4"><label className="block text-sm text-white" htmlFor="support-subject">Yeni destek talebi</label><input id="support-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={120} required placeholder="Konuyu kısaca yaz" /><Button full loading={busy} type="submit">Konuşma başlat</Button><p className="text-xs text-mist">En fazla 5 açık talep oluşturabilirsin.</p><p className="text-xs leading-relaxed text-mist-2">Yapay zekâ asistanı etkin olduğunda ilk yanıtı o hazırlar; bu durumda mesajın, e-posta, telefon ve kart/IBAN gibi bilgiler maskelenerek yurt dışındaki hizmet sağlayıcımıza (OpenAI, ABD) iletilir. Ödeme, iade, şifre, şikâyet, KVKK ve sağlık konuları doğrudan temsilciye aktarılır. Mesajlarına ad-adres, kart, şifre veya sağlık bilgisi yazma. <Link to="/yasal/aydinlatma-metni" className="text-gold-400 hover:text-gold-300">Aydınlatma Metni</Link></p></form>}
        {failure && <p role="alert" className="text-sm text-error-300">Talep oluşturulamadı. Açık taleplerini kontrol edip tekrar dene.</p>}
        <div className="space-y-2">{q.data.threads.filter((t) => filter === 'all' || t.status === filter).map((t) => <button key={t.id} onClick={() => setSelected(t.id)} className={`w-full rounded-xl border p-4 text-left ${selected === t.id ? 'border-gold-500 bg-gold-500/10' : 'border-line bg-coal'}`}><p className="truncate text-sm font-semibold text-white">{t.subject}</p><p className="mt-1 text-xs text-mist">#{t.id.slice(0,8)} · {supportLabels[t.status]}</p><p className="mt-1 text-[10px] text-mist">{new Date(t.updated_at).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p></button>)}{!q.data.threads.length && <p className="p-4 text-sm text-mist">Henüz destek konuşması yok.</p>}</div>
        {workspace && <ThemeSelect />}
      </aside>
      {thread ? <SupportConversation key={thread.id} thread={thread} workspace={workspace} reload={q.reload} /> : <div className="card flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"><MessageSquare className="h-8 w-8 text-gold-500" /><p className="text-mist">{workspace ? 'Yanıtlamak için bir konuşma seç.' : 'Bir konuşma seç veya yeni talep oluştur.'}</p></div>}
    </div>
  </div>;
}
