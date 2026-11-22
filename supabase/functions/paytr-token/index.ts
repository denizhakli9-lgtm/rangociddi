import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

/**
 * PayTR iFrame API, step 1: creates a PayTR payment token for the signed-in customer's pending deposit.
 * The amount always comes from the database (paytr_begin_order), never from the browser.
 * Secrets: PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT. Optional: SITE_URL.
 * Supabase provides SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS and SUPABASE_SECRET_KEYS itself.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://rango.com.tr').replace(/\/+$/, '');

const encoder = new TextEncoder();

/**
 * The project's `default` publishable or secret API key. Supabase gives every Edge Function its API keys as JSON
 * objects keyed by key name (SUPABASE_PUBLISHABLE_KEYS, SUPABASE_SECRET_KEYS). The legacy JWT-based SUPABASE_ANON_KEY
 * and SUPABASE_SERVICE_ROLE_KEY are deliberately not used, not even as a fallback: they stop working once the legacy
 * API keys are disabled, and a fallback would hide a missing key until then.
 */
function supabaseKey(variable: 'SUPABASE_PUBLISHABLE_KEYS' | 'SUPABASE_SECRET_KEYS'): string {
  const prefix = variable === 'SUPABASE_SECRET_KEYS' ? 'sb_secret_' : 'sb_publishable_';
  let key: unknown;
  try {
    key = JSON.parse(Deno.env.get(variable) ?? 'null')?.default;
  } catch {
    // Reported below.
  }
  if (typeof key !== 'string' || !key.startsWith(prefix)) throw new Error(`${variable} has no "default" ${prefix} key`);
  return key;
}

async function hmacBase64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
  return btoa(String.fromCharCode(...signature));
}

function base64Utf8(text: string): string {
  const bytes = encoder.encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Alphanumeric order id, unique per payment attempt (PayTR allows only letters and digits). */
function newMerchantOid(): string {
  const random = crypto.getRandomValues(new Uint8Array(12));
  return 'RG' + Date.now().toString(36).toUpperCase() + Array.from(random, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * PayTR wants the customer's public IP (at most 39 characters). Only headers set by the platform's edge are
 * used; X-Forwarded-For is not, because a caller can prepend any address to it.
 */
const IP = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-f:]{2,39})$/i;
function clientIp(req: Request): string {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
  ];
  for (const candidate of candidates) {
    const ip = candidate?.trim() ?? '';
    if (ip && ip.length <= 39 && IP.test(ip)) return ip;
  }
  return '';
}

/** PayTR rejects empty customer fields; keep them plain and within PayTR's limits. */
const clean = (value: unknown, max: number) => String(value ?? '').replace(/[\r\n\t<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

Deno.serve(async (req: Request) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'VEYRA_INVALID_INPUT' }, 405);

  try {
    const merchantId = Deno.env.get('PAYTR_MERCHANT_ID')?.trim();
    const merchantKey = Deno.env.get('PAYTR_MERCHANT_KEY')?.trim();
    const merchantSalt = Deno.env.get('PAYTR_MERCHANT_SALT')?.trim();
    if (!merchantId || !merchantKey || !merchantSalt) {
      console.error('paytr-token: PayTR secrets are missing');
      return reply({ error: 'VEYRA_PROVIDER_REQUIRED' }, 503);
    }

    const client = createClient(Deno.env.get('SUPABASE_URL')!, supabaseKey('SUPABASE_PUBLISHABLE_KEYS'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) return reply({ error: 'VEYRA_AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => null) as { appointment?: unknown; platform?: unknown; lang?: unknown } | null;
    const appointment = typeof body?.appointment === 'string' ? body.appointment : '';
    if (!UUID.test(appointment)) return reply({ error: 'VEYRA_INVALID_INPUT' }, 400);
    const native = body?.platform === 'app';
    // PayTR's payment and 3-D Secure pages exist in Turkish and English.
    const lang = body?.lang === 'en' ? 'en' : 'tr';

    const userIp = clientIp(req);
    if (!userIp) return reply({ error: 'VEYRA_PAYMENT_PROVIDER' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, supabaseKey('SUPABASE_SECRET_KEYS'));

    // Before a new payment page: ask PayTR whether an earlier attempt of this booking was already paid
    // (its notification may still be on the way), so the customer is never charged twice.
    const { data: earlier } = await admin.rpc('paytr_orders_to_check', { p_user: auth.user.id, p_appointment: appointment });
    for (const prev of (earlier ?? []) as { merchant_oid: string; amount_kurus: number }[]) {
      const statusToken = await hmacBase64(merchantKey, merchantId + prev.merchant_oid + merchantSalt);
      const statusResponse = await fetch('https://www.paytr.com/odeme/durum-sorgu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ merchant_id: merchantId, merchant_oid: prev.merchant_oid, paytr_token: statusToken }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      const status = await statusResponse?.json().catch(() => null) as { status?: string; test_mode?: unknown } | null;
      if (status?.status !== 'success') continue;
      const { data: applied } = await admin.rpc('paytr_apply_callback', {
        p_oid: prev.merchant_oid, p_success: true, p_amount_kurus: prev.amount_kurus, p_reason: 'durum-sorgu',
        p_test: String(status.test_mode ?? '') === '1',
      });
      if (applied === 'paid' || applied === 'duplicate') return reply({ error: 'VEYRA_ALREADY_PAID' }, 409);
    }

    const merchantOid = newMerchantOid();
    const { data: order, error: orderError } = await admin.rpc('paytr_begin_order', {
      p_user: auth.user.id, p_appointment: appointment, p_oid: merchantOid,
    });
    if (orderError) {
      const code = orderError.message?.match(/VEYRA_[A-Z0-9_]+/)?.[0];
      if (!code) console.error('paytr-token: begin_order failed', orderError);
      return reply({ error: code ?? 'VEYRA_PAYMENT_PROVIDER' }, code ? 400 : 500);
    }

    // PayTR needs the payer's real name and phone (fraud checks, disputes); nothing is invented.
    const userName = clean(order.full_name, 60);
    const userPhone = clean(order.phone, 20);
    if (!userName || !userPhone) return reply({ error: 'VEYRA_PROFILE_INCOMPLETE' }, 400);

    const amount = String(order.amount_kurus);
    const testMode = order.test_mode ? '1' : '0';
    const noInstallment = '1';
    const maxInstallment = '0';
    const currency = 'TL';
    // PayTR rejects e-mail addresses with non-ASCII (e.g. Turkish) characters; such rare addresses get a neutral alias.
    const rawEmail = clean(order.email || auth.user.email, 100);
    const email = /^[\x21-\x7E]+@[\x21-\x7E]+$/.test(rawEmail) ? rawEmail : `musteri-${auth.user.id.slice(0, 8)}@rango.com.tr`;
    const basket = base64Utf8(JSON.stringify([[clean(order.item, 200) || 'Randevu kaporası', (order.amount_kurus / 100).toFixed(2), 1]]));
    // PayTR stops the payment page shortly before our slot hold runs out.
    const timeoutMinutes = Math.max(1, Math.min(30, Math.floor(order.seconds_left / 60) - 1));

    // A static return page: it works whether PayTR opens it in the top window, inside its iframe (it then moves
    // the top window to the booking's payment page) or in the app's in-app browser (App Links hand it to the app).
    const source = native ? 'app' : 'web';
    const okUrl = `${SITE_URL}/odeme-sonuc.html?randevu=${appointment}&durum=ok&kaynak=${source}`;
    const failUrl = `${SITE_URL}/odeme-sonuc.html?randevu=${appointment}&durum=hata&kaynak=${source}`;

    const paytrToken = await hmacBase64(
      merchantKey,
      merchantId + userIp + merchantOid + email + amount + basket + noInstallment + maxInstallment + currency + testMode + merchantSalt,
    );

    const form = new URLSearchParams({
      merchant_id: merchantId,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email,
      payment_amount: amount,
      paytr_token: paytrToken,
      user_basket: basket,
      // Detailed PayTR error messages while testing; integration errors arrive as code 99 otherwise.
      debug_on: testMode,
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: userName,
      user_address: clean(order.address, 400) || 'Türkiye',
      user_phone: userPhone,
      merchant_ok_url: okUrl,
      merchant_fail_url: failUrl,
      timeout_limit: String(timeoutMinutes),
      currency,
      test_mode: testMode,
      lang,
    });

    const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(() => null) as { status?: string; token?: string; reason?: string } | null;
    if (!response.ok || result?.status !== 'success' || !result.token) {
      console.error('paytr-token: PayTR refused the token request', response.status, result?.reason ?? result);
      return reply({ error: 'VEYRA_PAYMENT_PROVIDER' }, 502);
    }

    return reply({ token: result.token, url: `https://www.paytr.com/odeme/guvenli/${result.token}`, test: order.test_mode === true });
  } catch (err) {
    console.error('paytr-token: unexpected error', err);
    return reply({ error: 'VEYRA_PAYMENT_PROVIDER' }, 500);
  }
});
