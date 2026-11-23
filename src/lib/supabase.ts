import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
// The project's sb_publishable_ key (vite.config.ts resolves it and refuses legacy JWT keys at build time).
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(url, publishableKey);

export const MEDIA_BUCKET = 'business-media';

// PASSWORD_RECOVERY fires only once, right after the e-mail link is consumed,
// which is usually before the lazily loaded ResetPassword page subscribes.
// Remember which account it was for, so that page can tell a genuine recovery
// link from an ordinary signed-in session. (Never derived from the URL: anyone
// can append `#type=recovery` by hand.)
let recoveryUserId: string | null = null;
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') recoveryUserId = session?.user.id ?? null;
  else if (event === 'SIGNED_OUT') recoveryUserId = null;
});

/** True when this tab opened a password-recovery link for the given account. */
export function isRecoveryPending(userId: string | null | undefined): boolean {
  return !!userId && userId === recoveryUserId;
}

export function clearRecoveryPending(): void {
  recoveryUserId = null;
}
