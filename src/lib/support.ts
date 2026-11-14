import { supabase } from '@/lib/supabase';
export interface SupportThread { id: string; user_id: string; subject: string; status: 'ai' | 'waiting' | 'human' | 'resolved'; assigned_to: string | null; updated_at: string }
export interface SupportMessage { id: string; sender: 'user' | 'agent' | 'ai'; body: string; created_at: string }
export const supportLabels = { ai: 'Yapay zekâ karşılaması', waiting: 'Temsilci bekleniyor', human: 'Canlı temsilci', resolved: 'Çözüldü' };
export async function supportAction(action: string, thread?: string, text = '') {
  const { data, error } = await supabase.rpc('support_action', { p_action: action, p_thread: thread ?? null, p_text: text });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid response');
  return data;
}
export async function requestAI(thread: string) {
  const { data, error } = await supabase.functions.invoke('support-ai', { body: { thread } });
  if (error || !data || typeof data.handoff !== 'boolean') {
    await supportAction('handoff', thread);
    return true;
  }
  return data.handoff as boolean;
}
