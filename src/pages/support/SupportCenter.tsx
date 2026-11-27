import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState, PageLoader } from '@/components/ui/Feedback';
import { ThemeSelect } from '@/components/ui/ThemeSelect';
import { supportAction, supportLabel, type SupportThread } from '@/lib/support';
import { intlLocale, tx } from '@/i18n/locale';
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
  if (!q.data?.allowed) return <p className="card p-6 text-mist">{tx('Bu alan yalnızca yetkili destek ekibine açıktır.', 'This area is only open to the authorised support team.')}</p>;
  const thread = q.data.threads.find((t) => t.id === selected);
  return <div className="mx-auto max-w-6xl space-y-6">
    <div><h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] text-white">{workspace ? 'Destek Merkezi' : tx('Yardım ve Destek', 'Help & support')}</h1><p className="mt-2 text-sm text-mist">{q.data.online ? tx('Canlı destek ekibi çevrimiçi.', 'The live support team is online.') : tx('Canlı destek şu anda çevrimdışı. Mesajınız kaydedilir; ekibimiz döndüğünde yanıtlar.', 'Live support is offline right now. Your message is saved and the team will reply when they are back.')}</p></div>
    {workspace && <Link to="/profil" className="inline-flex min-h-11 items-center text-xs text-gold-500">Profilime dön</Link>}
    {!workspace && <Link to="/yonetim/destek-ekibi" className="inline-flex min-h-11 items-center text-xs text-gold-500">{tx('Destek görevlisi girişi', 'Support staff sign-in')}</Link>}
    {workspace && profile?.role === 'admin' && <SupportSettings online={q.data.online} reload={q.reload} />}
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <aside className="space-y-4">
        {workspace ? <select aria-label="Konuşma durumu" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Tüm konuşmalar</option>{(['ai', 'waiting', 'human', 'resolved'] as const).map((v) => <option key={v} value={v}>{supportLabel(v)}</option>)}</select> : <form onSubmit={create} className="card space-y-3 p-4"><label className="block text-sm text-white" htmlFor="support-subject">{tx('Yeni destek talebi', 'New support request')}</label><input id="support-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={120} required placeholder={tx('Konuyu kısaca yaz', 'Briefly describe the topic')} /><Button full loading={busy} type="submit">{tx('Konuşma başlat', 'Start conversation')}</Button><p className="text-xs text-mist">{tx('En fazla 5 açık talep oluşturabilirsiniz.', 'You can have up to 5 open requests.')}</p><p className="text-xs leading-relaxed text-mist-2">{tx('Yapay zekâ asistanı etkin olduğunda ilk yanıtı o hazırlar; bu durumda mesajınız, e-posta, telefon ve kart/IBAN gibi bilgiler maskelenerek yurt dışındaki hizmet sağlayıcımıza (OpenAI, ABD) iletilir. Ödeme, iade, şifre, şikâyet, KVKK ve sağlık konuları doğrudan temsilciye aktarılır. Mesajlarına ad-adres, kart, şifre veya sağlık bilgisi yazma.', 'When the AI assistant is on, it prepares the first reply; your message is then sent to our provider abroad (OpenAI, USA) with emails, phone numbers and card/IBAN details masked. Payments, refunds, passwords, complaints, data protection and health go straight to a person. Do not write your address, card, password or health details. The assistant currently replies in Turkish.')} <Link to="/yasal/aydinlatma-metni" className="text-gold-400 hover:text-gold-300">{tx('Aydınlatma Metni', 'Privacy Notice')}</Link></p></form>}
        {failure && <p role="alert" className="text-sm text-error-300">{tx('Talep oluşturulamadı. Açık taleplerinizi kontrol edip tekrar deneyin.', 'The request could not be created. Check your open requests and try again.')}</p>}
        <div className="space-y-2">{q.data.threads.filter((t) => filter === 'all' || t.status === filter).map((t) => <button key={t.id} onClick={() => setSelected(t.id)} className={`w-full rounded-xl border p-4 text-left ${selected === t.id ? 'border-gold-500 bg-gold-500/10' : 'border-line bg-coal'}`}><p className="truncate text-sm font-semibold text-white">{t.subject}</p><p className="mt-1 text-xs text-mist">#{t.id.slice(0,8)} · {supportLabel(t.status)}</p><p className="mt-1 text-[10px] text-mist">{new Date(t.updated_at).toLocaleString(intlLocale(), { timeZone: 'Europe/Istanbul' })}</p></button>)}{!q.data.threads.length && <p className="p-4 text-sm text-mist">{tx('Henüz destek konuşması yok.', 'No support conversations yet.')}</p>}</div>
        {workspace && <ThemeSelect />}
      </aside>
      {thread ? <SupportConversation key={thread.id} thread={thread} workspace={workspace} reload={q.reload} /> : <div className="card flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"><MessageSquare className="h-8 w-8 text-gold-500" /><p className="text-mist">{workspace ? 'Yanıtlamak için bir konuşma seç.' : tx('Bir konuşma seçin veya yeni talep oluşturun.', 'Choose a conversation or create a new request.')}</p></div>}
    </div>
  </div>;
}
