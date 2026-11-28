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
export async function supportAction(action: string, thread?: string, text = '') {
  const { data, error } = await supabase.rpc('support_action', { p_action: action, p_thread: thread ?? null, p_text: text });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid response');
  return data;
}
/**
 * When the signed-in user agreed to the AI assistant (support_ai_consents), or null without consent. Fails closed:
 * any read error (including a database without the table yet) counts as no consent, so the user gets a person.
 */
export async function fetchAIConsent(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from('support_ai_consents').select('consented_at').eq('user_id', userId).maybeSingle();
  if (error || !data) return null;
  return typeof data.consented_at === 'string' ? data.consented_at : null;
}
/** Gives (true) or withdraws (false) consent; withdrawing also moves open AI conversations to the support team. */
export async function setAIConsent(consent: boolean): Promise<void> {
  const { error } = await supabase.rpc('support_set_ai_consent', { p_consent: consent });
  if (error) throw error;
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
