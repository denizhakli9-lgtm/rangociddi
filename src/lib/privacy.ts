import { supabase } from '@/lib/supabase';
import { COMPANY, LEGAL_VERSIONS } from '@/lib/legal';
import type { Profile } from '@/lib/types';

type Section = { rows: unknown[] } | { error: string };

async function collect(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Section> {
  try {
    const { data, error } = await query;
    if (error) return { error: error.message };
    return { rows: Array.isArray(data) ? data : data ? [data] : [] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'unknown error' };
  }
}

/**
 * Builds a copy of the personal data the signed-in user can access about
 * themselves (KVKK md. 11 - right of access). Every query runs with the user's
 * own session, so Row Level Security limits it to their own records.
 */
export async function exportMyData(profile: Profile): Promise<Blob> {
  const uid = profile.id;
  const [{ data: auth }, appointments, payments, refunds, reviews, favorites, notifications, threads, businesses] = await Promise.all([
    supabase.auth.getUser(),
    collect(supabase.from('appointments').select('*').eq('customer_id', uid).order('starts_at', { ascending: false })),
    collect(supabase.from('payments').select('id,appointment_id,amount,currency,status,provider,card_brand,card_last4,paid_at,refunded_amount,refunded_at,created_at').eq('customer_id', uid)),
    collect(supabase.from('refund_requests').select('*').eq('customer_id', uid)),
    collect(supabase.from('reviews').select('*').eq('customer_id', uid)),
    collect(supabase.from('favorites').select('business_id,created_at').eq('customer_id', uid)),
    collect(supabase.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false })),
    collect(supabase.from('support_threads').select('*').eq('user_id', uid)),
    profile.role === 'business' ? collect(supabase.from('businesses').select('*').eq('owner_id', uid)) : Promise.resolve<Section>({ rows: [] }),
  ]);

  let payoutAccounts: Section = { rows: [] };
  let payoutChanges: Section = { rows: [] };
  if (profile.role === 'business' && 'rows' in businesses && businesses.rows.length) {
    const ids = (businesses.rows as { id: string }[]).map((b) => b.id);
    [payoutAccounts, payoutChanges] = await Promise.all([
      collect(supabase.from('business_payout_accounts').select('*').in('business_id', ids)),
      collect(supabase.from('payout_account_changes').select('*').in('business_id', ids)),
    ]);
  }

  let supportMessages: Section = { rows: [] };
  if ('rows' in threads && threads.rows.length) {
    const ids = (threads.rows as { id: string }[]).map((t) => t.id);
    supportMessages = await collect(supabase.from('support_messages').select('thread_id,sender,body,created_at').in('thread_id', ids).order('created_at'));
  }

  const user = auth.user;
  const payload = {
    exported_at: new Date().toISOString(),
    controller: { name: COMPANY.legalName, brand: COMPANY.brand, kvkk_contact: COMPANY.kvkkEmail },
    legal_versions: LEGAL_VERSIONS,
    account: user
      ? {
          id: user.id,
          email: user.email,
          phone: user.phone || null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
          email_confirmed_at: user.email_confirmed_at,
          metadata: user.user_metadata,
        }
      : null,
    profile,
    appointments,
    payments,
    refund_requests: refunds,
    reviews,
    favorites,
    notifications,
    support_threads: threads,
    support_messages: supportMessages,
    businesses,
    payout_accounts: payoutAccounts,
    payout_account_changes: payoutChanges,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
