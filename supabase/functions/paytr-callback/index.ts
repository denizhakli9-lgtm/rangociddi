import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

/**
 * PayTR iFrame API, step 2: PayTR's server-to-server payment notification ("Bildirim URL").
 * This is the only place a PayTR deposit is marked as paid. Deployed with verify_jwt = false because
 * PayTR sends no Supabase token; every request is authenticated by PayTR's HMAC hash instead.
 *
 * PayTR keeps retrying until the response body is exactly "OK", so:
 *  - a valid notification (including a repeat) answers "OK",
 *  - a bad hash answers 400 (never "OK"),
 *  - a database error answers 500 so PayTR tries again later.
 */

const encoder = new TextEncoder();

async function hmacBase64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
  return btoa(String.fromCharCode(...signature));
}

function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const text = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return text('Method not allowed', 405);

  const merchantKey = Deno.env.get('PAYTR_MERCHANT_KEY')?.trim();
  const merchantSalt = Deno.env.get('PAYTR_MERCHANT_SALT')?.trim();
  if (!merchantKey || !merchantSalt) {
    console.error('paytr-callback: PayTR secrets are missing');
    return text('Not configured', 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return text('Bad request', 400);
  }
  const field = (name: string) => String(form.get(name) ?? '');
  const merchantOid = field('merchant_oid');
  const status = field('status');
  const totalAmount = field('total_amount');
  const hash = field('hash');

  if (!/^[A-Za-z0-9]{8,64}$/.test(merchantOid) || !/^\d+$/.test(totalAmount) || !hash) return text('Bad request', 400);

  const expected = await hmacBase64(merchantKey, merchantOid + merchantSalt + status + totalAmount);
  if (!safeEqual(expected, hash)) {
    console.error('paytr-callback: hash mismatch for', merchantOid);
    return text('PAYTR notification failed: bad hash', 400);
  }

  // payment_amount is the order amount; total_amount may include installment interest.
  const paymentAmount = field('payment_amount');
  const amountKurus = Number(/^\d+$/.test(paymentAmount) ? paymentAmount : totalAmount);
  const reason = [field('failed_reason_code'), field('failed_reason_msg')].filter(Boolean).join(' - ');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data, error } = await admin.rpc('paytr_apply_callback', {
    p_oid: merchantOid,
    p_success: status === 'success',
    p_amount_kurus: amountKurus,
    p_reason: reason,
  });
  if (error) {
    console.error('paytr-callback: apply failed', merchantOid, error);
    return text('Temporary error', 500);
  }
  if (data !== 'paid' && data !== 'failed' && data !== 'duplicate') console.warn('paytr-callback:', merchantOid, data);
  return text('OK');
});
