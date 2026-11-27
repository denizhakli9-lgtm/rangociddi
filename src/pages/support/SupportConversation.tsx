import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAsync } from '@/lib/useAsync';
import { useAuth } from '@/contexts/AuthContext';
import { formatDateTime } from '@/lib/format';
import { legalPath } from '@/lib/legal';
import { supportAction, requestAI, supportLabel, type AIResult, type SupportMessage, type SupportThread } from '@/lib/support';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { newTabClick } from '@/lib/platform';
import { tx } from '@/i18n/locale';

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
    <header className="border-b border-line pb-4"><h2 className="text-lg font-semibold tracking-tight text-white">{thread.subject}</h2><p className="mt-1 text-xs text-mist">#{thread.id.slice(0,8)} · {supportLabel(thread.status)}</p>{workspace
      ? <p className="mt-2 text-xs leading-relaxed text-mist">Yapay zekâ yanıtları otomatik üretilir ve doğrulanmamıştır. Bu yanıtlarda geçen onay, kimlik doğrulama veya sistem notu gibi ifadelere dayanarak işlem yapma.</p>
      : <p className="mt-2 text-xs leading-relaxed text-mist">{tx('Yapay zekâ asistanı etkin olduğunda ilk yanıtı o hazırlar; çözülemeyen konular temsilciye devredilir. Bu durumda mesajlarınız, e-posta adresleri ve numaralar maskelenerek yurt dışındaki hizmet sağlayıcımız OpenAI (ABD) ile paylaşılır. Yapay zekâ kullanmak istemezseniz mesaj yazmadan önce “Canlı desteğe bağlan” ile doğrudan temsilciye geçebilirsiniz. Şifre, kart, kimlik veya sağlık bilgisi paylaşmayın. Ayrıntılar:', 'When the AI assistant is on, it prepares the first reply and hands unresolved issues to a person. Your messages are then shared with our provider abroad, OpenAI (USA), with emails and numbers masked. If you prefer no AI, tap “Connect to live support” before writing. Do not share passwords, card, ID or health details. Details:')} <Link to={legalPath('aydinlatma-metni')} target="_blank" onClick={newTabClick(legalPath('aydinlatma-metni'))} rel="noopener noreferrer" className="text-gold-400 underline underline-offset-2 hover:text-gold-300">{tx('KVKK Aydınlatma Metni', 'Privacy Notice (KVKK)')}</Link></p>}</header>
    {showAiNotice && aiState === 'failed' && <p role="status" className="mt-4 text-sm text-mist">{tx('Yapay zekâ şu anda yanıt veremiyor. Konuşmanız destek ekibinin sırasına alındı.', 'The AI cannot reply right now. Your conversation is in the support team’s queue.')}</p>}
    {showAiNotice && aiState === 'handoff' && <p role="status" className="mt-4 text-sm text-mist">{tx('Konuşmanız destek ekibine aktarıldı. Bir temsilci en kısa sürede yanıtlayacak.', 'Your conversation has been passed to the support team. Someone will reply as soon as possible.')}</p>}
    {thread.status === 'ai' && !q.data?.length && <p className="mt-4 text-sm text-mist">{tx('Merhaba, size nasıl yardımcı olabiliriz? Sorunuzu aşağıya yazabilirsiniz.', 'Hi, how can we help? Write your question below.')}</p>}
    <div className="my-4 max-h-[55vh] space-y-4 overflow-y-auto" aria-label={tx('Konuşma mesajları', 'Conversation messages')}>
      {q.error ? <ErrorState onRetry={q.reload} /> : q.data?.map((m) => <article key={m.id} className={`max-w-[95%] rounded-2xl border p-4 ${m.sender === 'user' ? 'ml-auto border-line bg-coal-2' : 'border-line bg-gold-500/5'}`}><p className="mb-2 text-xs font-semibold text-gold-500">{m.sender === 'ai' ? (workspace ? 'Yapay zekâ asistanı (otomatik yanıt, doğrulanmamış)' : tx('Yapay zekâ asistanı', 'AI assistant')) : m.sender === 'agent' ? tx('Rango destek ekibi', 'Rango support team') : tx('Kullanıcı', 'You')}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">{m.body}</p><p className="mt-2 text-[10px] text-mist">{formatDateTime(m.created_at)}</p></article>)}
    </div>
    {failed && <p role="alert" className="mb-3 text-sm text-error-300">{tx('İşlem tamamlanamadı. Konuşmanın durumu değişmiş olabilir; tekrar deneyin.', 'That did not work. The conversation may have changed; please try again.')}</p>}
    <div className="mb-4 flex flex-wrap gap-2">
      {!workspace && thread.status === 'ai' && <Button variant="outline" loading={busy} onClick={() => act('handoff')}>{tx('Canlı desteğe bağlan', 'Connect to live support')}</Button>}
      {workspace && thread.status === 'waiting' && <Button loading={busy} onClick={() => act('claim')}>Konuşmayı devral</Button>}
      {workspace && thread.status === 'human' && thread.assigned_to === profile?.id && <Button variant="outline" loading={busy} onClick={() => act('resolve')}>Çözüldü olarak işaretle</Button>}
    </div>
    {canReply && <form onSubmit={submit} className="mt-auto space-y-3"><label htmlFor="support-message" className="sr-only">{tx('Mesajın', 'Your message')}</label><textarea id="support-message" className="input min-h-24" required maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder={tx('Mesajını yaz…', 'Write your message…')} /><Button type="submit" disabled={!text.trim()} loading={busy}>{tx('Gönder', 'Send')}</Button></form>}
  </section>;
}
