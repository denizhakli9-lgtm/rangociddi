import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bot, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { ErrorState, PageLoader } from '@/components/ui/Feedback';
import { ThemeSelect } from '@/components/ui/ThemeSelect';
import { fetchAIConsent, setAIConsent, supportAction, supportLabel, type SupportThread } from '@/lib/support';
import { formatDate } from '@/lib/format';
import { intlLocale, tx } from '@/i18n/locale';
import { AIConsentDialog } from './AIConsentDialog';
import SupportConversation from './SupportConversation';
import SupportSettings from './SupportSettings';

export default function SupportCenter({ workspace = false }: { workspace?: boolean }) {
  const { profile } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(false);
  const [filter, setFilter] = useState('all');
  // AI consent (explicit opt-in): null while loading; `at` is null without consent. Not polled.
  const consent = useAsync(async () => ({ at: workspace || !profile ? null : await fetchAIConsent(profile.id) }), [profile?.id, workspace]);
  const [consentAsk, setConsentAsk] = useState<'create' | 'settings' | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentFailure, setConsentFailure] = useState(false);
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
  // `human`: the user declined the AI for this request, so the thread is handed to a person right away even if the
  // server sees a stored consent (handoff is a no-op on threads that already wait for a person).
  const startThread = async (human = false) => {
    setBusy(true); setFailure(false);
    try {
      const id = await supportAction('create', undefined, subject);
      if (human) await supportAction('handoff', id).catch(() => undefined);
      setSelected(id); setSubject(''); await q.reload();
    }
    catch { setFailure(true); } finally { setBusy(false); }
  };
  // Without consent the user is asked first; the server starts the thread with the AI only after consent.
  const create = (e: FormEvent) => {
    e.preventDefault(); setConsentFailure(false);
    if (consent.data?.at) void startThread(); else setConsentAsk('create');
  };
  const changeConsent = async (agree: boolean) => {
    setConsentBusy(true); setConsentFailure(false);
    try {
      await setAIConsent(agree);
      consent.setData({ at: agree ? new Date().toISOString() : null });
      if (!agree) await q.reload();
      return true;
    } catch { setConsentFailure(true); return false; } finally { setConsentBusy(false); }
  };
  const acceptConsent = async () => {
    const mode = consentAsk;
    if (!(await changeConsent(true))) { setConsentAsk(null); return; }
    setConsentAsk(null);
    if (mode === 'create') await startThread();
  };
  const declineConsent = () => {
    const mode = consentAsk;
    setConsentAsk(null);
    if (mode === 'create') void startThread(true);
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
        {workspace ? <select aria-label="Konuşma durumu" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Tüm konuşmalar</option>{(['ai', 'waiting', 'human', 'resolved'] as const).map((v) => <option key={v} value={v}>{supportLabel(v)}</option>)}</select> : <form onSubmit={create} className="card space-y-3 p-4"><label className="block text-sm text-white" htmlFor="support-subject">{tx('Yeni destek talebi', 'New support request')}</label><input id="support-subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} minLength={3} maxLength={120} required placeholder={tx('Konuyu kısaca yaz', 'Briefly describe the topic')} /><Button full loading={busy} disabled={consent.loading && !consent.data} type="submit">{tx('Konuşma başlat', 'Start conversation')}</Button><p className="text-xs text-mist">{tx('En fazla 5 açık talep oluşturabilirsiniz.', 'You can have up to 5 open requests.')}</p></form>}
        {!workspace && consent.data && <div className="card space-y-2 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-white"><Bot className="h-4 w-4 text-gold-500" />{consent.data.at ? tx('Yapay zekâ asistanı: açık', 'AI assistant: on') : tx('Yapay zekâ asistanı: kapalı', 'AI assistant: off')}</p>
          <p className="text-xs leading-relaxed text-mist-2">{consent.data.at
            ? tx(`${formatDate(consent.data.at)} tarihinde onay verdiniz. Yeni taleplerinizde ilk yanıtı yapay zekâ hazırlar; mesajlarınızın metni maskelenerek OpenAI (ABD) ile paylaşılır.`, `You agreed on ${formatDate(consent.data.at)}. The AI prepares the first reply to new requests; the text of your messages is shared, masked, with OpenAI (USA).`)
            : tx('Talepleriniz yalnızca destek ekibimiz tarafından yanıtlanır; mesajlarınız yapay zekâya gönderilmez.', 'Your requests are answered only by our support team; your messages are not sent to any AI.')}</p>
          {consent.data.at
            ? <Button size="sm" variant="outline" loading={consentBusy} onClick={() => void changeConsent(false)}>{tx('Onayımı geri çek', 'Withdraw my consent')}</Button>
            : <Button size="sm" variant="outline" onClick={() => setConsentAsk('settings')}>{tx('Yapay zekâ asistanını aç', 'Turn on the AI assistant')}</Button>}
        </div>}
        {consentFailure && <p role="alert" className="text-sm text-error-300">{tx('Tercihiniz kaydedilemedi. Lütfen tekrar deneyin.', 'Your choice could not be saved. Please try again.')}</p>}
        {failure && <p role="alert" className="text-sm text-error-300">{tx('Talep oluşturulamadı. Açık taleplerinizi kontrol edip tekrar deneyin.', 'The request could not be created. Check your open requests and try again.')}</p>}
        <div className="space-y-2">{q.data.threads.filter((t) => filter === 'all' || t.status === filter).map((t) => <button key={t.id} onClick={() => setSelected(t.id)} className={`w-full rounded-xl border p-4 text-left ${selected === t.id ? 'border-gold-500 bg-gold-500/10' : 'border-line bg-coal'}`}><p className="truncate text-sm font-semibold text-white">{t.subject}</p><p className="mt-1 text-xs text-mist">#{t.id.slice(0,8)} · {supportLabel(t.status)}</p><p className="mt-1 text-[10px] text-mist">{new Date(t.updated_at).toLocaleString(intlLocale(), { timeZone: 'Europe/Istanbul' })}</p></button>)}{!q.data.threads.length && <p className="p-4 text-sm text-mist">{tx('Henüz destek konuşması yok.', 'No support conversations yet.')}</p>}</div>
        {workspace && <ThemeSelect />}
      </aside>
      {thread ? <SupportConversation key={thread.id} thread={thread} workspace={workspace} reload={q.reload} aiConsent={!!consent.data?.at} /> : <div className="card flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"><MessageSquare className="h-8 w-8 text-gold-500" /><p className="text-mist">{workspace ? 'Yanıtlamak için bir konuşma seç.' : tx('Bir konuşma seçin veya yeni talep oluşturun.', 'Choose a conversation or create a new request.')}</p></div>}
    </div>
    {!workspace && <AIConsentDialog open={consentAsk !== null} busy={consentBusy || busy} creating={consentAsk === 'create'} onAccept={() => void acceptConsent()} onDecline={declineConsent} onClose={() => setConsentAsk(null)} />}
  </div>;
}
