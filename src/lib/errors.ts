import { tr } from '@/i18n/tr';

type ErrorKey = keyof typeof tr.errors;

/** Maps backend errors to safe, user-facing Turkish messages. Raw details stay in the console. */
export function friendlyError(err: unknown, fallback: string = tr.errors.generic): string {
  console.error(err);
  const message = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  const match = message.match(/VEYRA_[A-Z0-9_]+/);
  if (match) {
    if (match[0] in tr.errors) return tr.errors[match[0] as ErrorKey];
    // A more specific server code (e.g. VEYRA_LIMIT_HOLDS) falls back to its family message (VEYRA_LIMIT).
    const family = (Object.keys(tr.errors) as ErrorKey[])
      .filter((k) => k.startsWith('VEYRA_') && match[0].startsWith(`${k}_`))
      .sort((a, b) => b.length - a.length)[0];
    if (family) return tr.errors[family];
  }
  if (/invalid login credentials/i.test(message)) return tr.errors.invalidCredentials;
  if (code === 'user_already_exists' || code === 'email_exists' || /user already registered/i.test(message)) return tr.errors.userExists;
  if (code === 'same_password' || /different from the old password/i.test(message)) return tr.errors.samePassword;
  const reasons = typeof err === 'object' && err && 'reasons' in err ? (err as { reasons: unknown }).reasons : null;
  if ((Array.isArray(reasons) && reasons.includes('pwned')) || /known to be weak|pwned|data breach/i.test(message)) return tr.errors.leakedPassword;
  if (/password/i.test(message) && /least|short|weak/i.test(message)) return tr.errors.weakPassword;
  if (/rate limit/i.test(message) || /rate_limit/i.test(code)) return tr.errors.rateLimit;
  if (code === '23505') return tr.errors.duplicate;
  if (/failed to fetch|network/i.test(message)) return tr.errors.network;
  return fallback;
}
