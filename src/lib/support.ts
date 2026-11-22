import { supabase } from '@/lib/supabase';
import { tx } from '@/i18n/locale';
export interface SupportThread { id: string; user_id: string; subject: string; status: 'ai' | 'waiting' | 'human' | 'resolved'; assigned_to: string | null; updated_at: string }
export interface SupportMessage { id: string; sender: 'user' | 'agent' | 'ai'; body: string; created_at: string }
const SUPPORT_LABELS = {
  ai: ['Yapay zekâ karşılaması', 'AI assistant'],
  waiting: ['Temsilci bekleniyor', 'Waiting for an agent'],
  human: ['Canlı temsilci', 'Live agent'],
  resolved: ['Çözüldü', 'Resolved'],
} as const satisfies Record<SupportThread['status'], readonly [string, string]>;
/** Status label in the current language (Turkish inside the support team workspace). */
export function supportLabel(status: SupportThread['status']): string {
  const [trText, enText] = SUPPORT_LABELS[status];
  return tx(trText, enText);
}
/** Longest subject a support request can have (support_threads.subject CHECK 3–120, the form's maxLength). */
export const SUPPORT_SUBJECT_MAX = 120;
/**
 * Makes free text (a `?konu=` link, a review report) a usable request subject: whitespace collapsed, trimmed and cut
 * to SUPPORT_SUBJECT_MAX UTF-16 units without splitting a character (a lone surrogate would break encodeURIComponent).
 */
export function supportSubject(text: string): string {
  let out = '';
  for (const ch of text.replace(/\s+/g, ' ').trim()) {
    if (out.length + ch.length > SUPPORT_SUBJECT_MAX) break;
    out += ch;
  }
  return out.trimEnd();
}
export async function supportAction(action: string, thread?: string, text = '') {
  const { data, error } = await supabase.rpc('support_action', { p_action: action, p_thread: thread ?? null, p_text: text });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid response');
  return data;
}
/**
 * 'answered': the AI replied (or had nothing to do); 'handoff': the conversation was deliberately passed to the team;
 * 'failed': the AI could not be reached, so the conversation was queued for the team. Never throws: the user's
 * message is already saved when this runs.
 */
export type AIResult = 'answered' | 'handoff' | 'failed';
export async function requestAI(thread: string): Promise<AIResult> {
  try {
    const { data, error } = await supabase.functions.invoke('support-ai', { body: { thread } });
    if (!error && data && typeof data.handoff === 'boolean') return data.handoff ? 'handoff' : 'answered';
  } catch { /* handled below */ }
  // The server may already have moved the thread out of AI mode; the caller reloads the thread to show its real status.
  try { await supportAction('handoff', thread); } catch { /* already queued or no longer in AI mode */ }
  return 'failed';
}
