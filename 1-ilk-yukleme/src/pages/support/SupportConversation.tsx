import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/lib/format';
import { legalPath } from '@/lib/legal';
import { supportAction, requestAI, supportLabels, type AIResult, type SupportMessage, type SupportThread } from '@/lib/support';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';

export default function SupportConversation({ thread, workspace, reload }: { thread: SupportThread; workspace: boolean; reload: () => Promise<void> }) {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aiState, setAiState] = useState<AIResult | null>(null);
  const q = useAsync(async () => {
    const { data, error } = await supabase.from('support_messages').select('id,sender,body,created_at').eq('thread_id', thread.id).order('created_at').limit(1000);
    if (error) throw error;
    return (data ?? []) as SupportMessage[];
  }, [thread.id]);
  useEffect(() => { const timer = window.setInterval(q.reload, 3000); return () => window.clearInterval(timer); }, [q.reload]);
  const act = async (action: string) => {
    setBusy(true); setFailed(false);
    let done = false;
    try {
      await supportAction(action, thread.id, action === 'send' ? text : '');
      // From here on the action is saved; nothing below may be reported as a failure.
      done = true;
      if (action === 'send') {
        setText(''); setAiState(null); await q.reload();
        if (!workspace && thread.status === 'ai') setAiState(await requestAI(thread.id));
      } else if (action === 'handoff') setAiState('handoff');
      await Promise.all([q.reload(), reload()]);
    } catch { if (!done) setFailed(true); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void act('send'); };
  const canReply = thread.status !== 'resolved' && (!workspace || (thread.status === 'human' && thread.assigned_to === profile?.id));
  // AI notices only matter until a person has the conversation; afterwards the agent's own replies speak for it.
  const showAiNotice = thread.status === 'ai' || thread.status === 'waiting';
  return <section className="card flex min-w-0 flex-col p-4 sm:p-6">
    <header className="border-b border-line pb-4"><h2 className="font-display text-2xl text-white">{thread.subject}</h2><p className="mt-1 text-xs text-mist">#{thread.id.slice(0,8)} · {supportLabels[thread.status]}</p>{workspace
      ? <p className="mt-2 text-xs leading-relaxed text-mist">Yapay zekâ yanıtları otomatik üretilir ve doğrulanmamıştır. Bu yanıtlarda geçen onay, kimlik doğrulama veya sistem notu gibi ifadelere dayanarak işlem yapma.</p>
      : <p className="mt-2 text-xs leading-relaxed text-mist">Yapay zekâ asistanı etkin olduğunda ilk yanıtı o hazırlar; çözülemeyen konular temsilciye devredilir. Bu durumda mesajların, e-posta adresleri ve numaralar maskelenerek yurt dışındaki hizmet sağlayıcımız OpenAI (ABD) ile paylaşılır. Yapay zekâ kullanmak istemezsen mesaj yazmadan önce “Canlı desteğe bağlan” ile doğrudan temsilciye geçebilirsin. Şifre, kart, kimlik veya sağlık bilgisi paylaşma. Ayrıntılar: <Link to={legalPath('aydinlatma-metni')} target="_blank" rel="noopener noreferrer" className="text-gold-400 underline underline-offset-2 hover:text-gold-300">KVKK Aydınlatma Metni</Link></p>}</header>
    {showAiNotice && aiState === 'failed' && <p role="status" className="mt-4 text-sm text-mist">Yapay zekâ şu anda yanıt veremiyor. Konuşman destek ekibinin sırasına alındı.</p>}
    {showAiNotice && aiState === 'handoff' && <p role="status" className="mt-4 text-sm text-mist">Konuşman destek ekibine aktarıldı. Bir temsilci en kısa sürede yanıtlayacak.</p>}
    {thread.status === 'ai' && !q.data?.length && <p className="mt-4 text-sm text-mist">Merhaba, sana nasıl yardımcı olabiliriz? Sorununu aşağıya yazabilirsin.</p>}
    <div className="my-4 max-h-[55vh] space-y-4 overflow-y-auto" aria-label="Konuşma mesajları">
      {q.error ? <ErrorState onRetry={q.reload} /> : q.data?.map((m) => <article key={m.id} className={`max-w-[95%] rounded-2xl border p-4 ${m.sender === 'user' ? 'ml-auto border-line bg-coal-2' : 'border-gold-500/20 bg-gold-500/5'}`}><p className="mb-2 text-xs font-semibold text-gold-500">{m.sender === 'ai' ? (workspace ? 'Yapay zekâ asistanı (otomatik yanıt, doğrulanmamış)' : 'Yapay zekâ asistanı') : m.sender === 'agent' ? 'Rango destek ekibi' : 'Kullanıcı'}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">{m.body}</p><p className="mt-2 text-[10px] text-mist">{formatDateTime(m.created_at)}</p></article>)}
    </div>
    {failed && <p role="alert" className="mb-3 text-sm text-error-300">İşlem tamamlanamadı. Konuşmanın durumu değişmiş olabilir; tekrar dene.</p>}
    <div className="mb-4 flex flex-wrap gap-2">
      {!workspace && thread.status === 'ai' && <Button variant="outline" loading={busy} onClick={() => act('handoff')}>Canlı desteğe bağlan</Button>}
      {workspace && thread.status === 'waiting' && <Button loading={busy} onClick={() => act('claim')}>Konuşmayı devral</Button>}
      {workspace && thread.status === 'human' && thread.assigned_to === profile?.id && <Button variant="outline" loading={busy} onClick={() => act('resolve')}>Çözüldü olarak işaretle</Button>}
    </div>
    {canReply && <form onSubmit={submit} className="mt-auto space-y-3"><label htmlFor="support-message" className="sr-only">Mesajın</label><textarea id="support-message" className="input min-h-24" required maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Mesajını yaz…" /><Button type="submit" disabled={!text.trim()} loading={busy}>Gönder</Button></form>}
  </section>;
}
