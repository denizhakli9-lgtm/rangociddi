import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Ban, MessageCircle, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchChatBlocked, setChatBlocked } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { useToast } from '@/contexts/ToastContext';
import type { AppointmentMessage } from '@/lib/types';
import type { ChatRole } from '@/lib/appointmentMessages';
import { tx } from '@/i18n/locale';
import { ReportButton } from '@/components/ReportContent';

interface Props {
  appointmentId: string;
  role: ChatRole;
  /** False shows the history read-only. */
  canSend: boolean;
  /** Name of the other side, shown on their messages. */
  otherName: string;
  /** Called after the other side's messages were marked read, so badges can refresh. */
  onRead?: () => void;
}

export function AppointmentChat({ appointmentId, role, canSend, otherName, onRead }: Props) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<AppointmentMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Whether this user blocked the other side; null while unknown (or before the migration exists),
  // in which case the block control is not offered.
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('appointment_messages')
      .select('id, appointment_id, sender_role, body, read_at, created_at')
      .eq('appointment_id', appointmentId)
      // The newest 300, so a long conversation still shows (and marks read) its latest messages.
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) {
      setFailed(true);
      return;
    }
    setFailed(false);
    const rows = ((data ?? []) as AppointmentMessage[]).reverse();
    setMessages(rows);
    if (rows.some((m) => m.sender_role !== role && !m.read_at)) {
      const { error: markError } = await supabase.rpc('mark_appointment_messages_read', { p_appointment: appointmentId });
      if (!markError) onReadRef.current?.();
    }
  }, [appointmentId, role]);

  useEffect(() => {
    setMessages(null);
    void load();
    // New messages arrive over realtime; the poll is a fallback for dropped connections.
    const timer = window.setInterval(() => void load(), 15000);
    const channel = supabase
      .channel(`appointment-messages:${appointmentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointment_messages', filter: `appointment_id=eq.${appointmentId}` }, () => void load())
      .subscribe();
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [appointmentId, load]);

  useEffect(() => {
    let alive = true;
    setBlocked(null);
    setConfirmBlock(false);
    fetchChatBlocked(appointmentId).then(
      (value) => alive && setBlocked(value),
      () => alive && setBlocked(null),
    );
    return () => {
      alive = false;
    };
  }, [appointmentId]);

  const changeBlock = async (next: boolean) => {
    setBlocking(true);
    try {
      await setChatBlocked(appointmentId, next);
      setBlocked(next);
      setConfirmBlock(false);
      toast(
        next
          ? tx('Engellendi. Bu kişinin mesajları artık size iletilmeyecek.', 'Blocked. Their messages will no longer reach you.')
          : tx('Engel kaldırıldı.', 'Unblocked.'),
        'success',
      );
      await load();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBlocking(false);
    }
  };

  // The server no longer returns a blocked user's messages; the filter also covers the moment
  // right after blocking, before the list is reloaded.
  const visible = blocked && messages ? messages.filter((m) => m.sender_role === role) : messages;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc('send_appointment_message', { p_appointment: appointmentId, p_body: body });
      if (error) throw error;
      setText('');
      await load();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-ink/40" aria-label={tx('Randevu mesajları', 'Booking messages')}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <MessageCircle className="h-3.5 w-3.5 text-gold-400" />
        <p className="text-xs font-medium text-white">{tx('Mesajlar', 'Messages')}</p>
        <p className="ml-auto truncate text-[10px] text-mist-2">{otherName}</p>
        {blocked === false && !confirmBlock && (
          <button
            type="button"
            onClick={() => setConfirmBlock(true)}
            className="-my-1.5 inline-flex min-h-8 shrink-0 items-center gap-1 px-1 text-[10px] text-mist-2 transition-colors hover:text-white"
          >
            <Ban className="h-3 w-3" />
            {tx('Engelle', 'Block')}
          </button>
        )}
      </header>

      {confirmBlock && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-coal-2 px-3 py-2">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-mist">
            {tx(`${otherName} engellensin mi? Mesajları size iletilmez ve birbirinize yazamazsınız. Randevunuz etkilenmez.`, `Block ${otherName}? Their messages will not reach you and neither of you can write. Your booking is not affected.`)}
          </p>
          <button type="button" onClick={() => setConfirmBlock(false)} className="min-h-8 px-1 text-[11px] text-mist-2 hover:text-white">
            {tx('Vazgeç', 'Cancel')}
          </button>
          <button
            type="button"
            disabled={blocking}
            onClick={() => void changeBlock(true)}
            className="min-h-8 rounded-lg border border-error-500/40 px-2.5 py-1 text-[11px] font-medium text-error-300 transition-colors hover:bg-error-500/10 disabled:opacity-50"
          >
            {tx('Engelle', 'Block')}
          </button>
        </div>
      )}

      <div ref={listRef} className="max-h-56 min-h-[4.5rem] space-y-2 overflow-y-auto px-3 py-3" aria-live="polite">
        {failed ? (
          <p className="text-xs text-error-300">{tx('Mesajlar yüklenemedi.', 'Messages could not be loaded.')}</p>
        ) : messages === null ? (
          <p className="text-xs text-mist-2">{tx('Yükleniyor…', 'Loading…')}</p>
        ) : visible === null ? null : !visible.length ? (
          <p className="text-xs text-mist-2">
            {blocked
              ? tx('Bu kişiyi engellediniz; mesajları size gösterilmez.', 'You blocked this person; their messages are hidden.')
              : canSend
              ? role === 'customer'
                ? tx('Randevunuzla ilgili işletmeye buradan yazabilirsiniz.', 'You can write to the business about your booking here.')
                : tx('Randevuyla ilgili müşteriye buradan yazabilirsiniz.', 'You can write to the customer about this booking here.')
              : tx('Bu randevu için mesaj yok.', 'No messages for this booking.')}
          </p>
        ) : (
          visible.map((m) => {
            const mine = m.sender_role === role;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'rounded-br-sm bg-gold-500/15 text-white' : 'rounded-bl-sm border border-line bg-coal-2 text-white'}`}>
                  <p className="whitespace-pre-wrap break-words text-sm leading-snug">{m.body}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-mist-2">
                    <span>{mine ? tx('Siz', 'You') : otherName} · {formatDateTime(m.created_at)}</span>
                    {!mine && <ReportButton targetType="message" targetId={m.id} iconOnly className="-m-1.5 ml-auto inline-flex h-8 w-8 items-center justify-center rounded text-mist-3 transition-colors hover:text-white" />}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {blocked ? (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <p className="min-w-0 flex-1 text-[11px] text-mist-2">{tx(`${otherName} engellendi.`, `${otherName} is blocked.`)}</p>
          <button
            type="button"
            disabled={blocking}
            onClick={() => void changeBlock(false)}
            className="shrink-0 text-[11px] font-medium text-white underline underline-offset-2 disabled:opacity-50"
          >
            {tx('Engeli kaldır', 'Unblock')}
          </button>
        </div>
      ) : canSend ? (
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-2">
          <label htmlFor={`chat-${appointmentId}`} className="sr-only">{tx('Mesajınız', 'Your message')}</label>
          <textarea
            id={`chat-${appointmentId}`}
            rows={1}
            maxLength={1000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={tx('Mesaj yazın…', 'Write a message…')}
            className="input min-h-10 flex-1 resize-none py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending}
            aria-label={tx('Gönder', 'Send')}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      ) : (
        <p className="border-t border-line px-3 py-2 text-[11px] text-mist-2">
          {tx('Bu randevu için mesajlaşma kapandı.', 'Messaging is closed for this booking.')}
        </p>
      )}
      {canSend && !blocked && (
        <p className="px-3 pb-2 text-[10px] leading-relaxed text-mist-3">
          {tx('Kart, şifre veya kimlik bilgisi paylaşmayın. Anlaşmazlık durumunda mesajlar Rango tarafından incelenebilir.', 'Do not share card, password or ID details. Messages may be reviewed by Rango in case of a dispute.')}
        </p>
      )}
    </section>
  );
}
