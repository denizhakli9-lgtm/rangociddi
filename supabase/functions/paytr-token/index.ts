import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

/**
 * PayTR iFrame API, step 1: creates a PayTR payment token for the signed-in customer's pending deposit.
 * The amount always comes from the database (paytr_begin_order), never from the browser.
 * Secrets: PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT. Optional: SITE_URL.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITE_URL = (Deno.env.get('SITE_URL') || 'https://rango.com.tr').replace(/\/+$/, '');

const encoder = new TextEncoder();

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

/** The customer's public IP as seen by the Supabase edge (first X-Forwarded-For entry). */
function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || req.headers.get('x-real-ip')?.trim() || '';
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

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) return reply({ error: 'VEYRA_AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => null) as { appointment?: unknown; platform?: unknown } | null;
    const appointment = typeof body?.appointment === 'string' ? body.appointment : '';
    if (!UUID.test(appointment)) return reply({ error: 'VEYRA_INVALID_INPUT' }, 400);
    const native = body?.platform === 'app';

    const userIp = clientIp(req);
    if (!userIp) return reply({ error: 'VEYRA_PAYMENT_PROVIDER' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const merchantOid = newMerchantOid();
    const { data: order, error: orderError } = await admin.rpc('paytr_begin_order', {
      p_user: auth.user.id, p_appointment: appointment, p_oid: merchantOid,
    });
    if (orderError) {
      const code = orderError.message?.match(/VEYRA_[A-Z0-9_]+/)?.[0];
      if (!code) console.error('paytr-token: begin_order failed', orderError);
      return reply({ error: code ?? 'VEYRA_PAYMENT_PROVIDER' }, code ? 400 : 500);
    }

    const amount = String(order.amount_kurus);
    const testMode = order.test_mode ? '1' : '0';
    const noInstallment = '1';
    const maxInstallment = '0';
    const currency = 'TL';
    const email = clean(order.email || auth.user.email, 100);
    const basket = base64Utf8(JSON.stringify([[clean(order.item, 200) || 'Randevu kaporası', (order.amount_kurus / 100).toFixed(2), 1]]));
    // PayTR stops the payment page shortly before our slot hold runs out.
    const timeoutMinutes = Math.max(1, Math.min(30, Math.floor(order.seconds_left / 60) - 1));

    const okUrl = native
      ? `${SITE_URL}/odeme-sonuc.html?randevu=${appointment}&durum=ok`
      : `${SITE_URL}/odeme/${appointment}?paytr=ok`;
    const failUrl = native
      ? `${SITE_URL}/odeme-sonuc.html?randevu=${appointment}&durum=hata`
      : `${SITE_URL}/odeme/${appointment}?paytr=hata`;

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
      debug_on: '0',
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: clean(order.full_name, 60) || 'Rango Müşterisi',
      user_address: clean(order.address, 400) || 'Türkiye',
      user_phone: clean(order.phone, 20) || '05000000000',
      merchant_ok_url: okUrl,
      merchant_fail_url: failUrl,
      timeout_limit: String(timeoutMinutes),
      currency,
      test_mode: testMode,
      lang: 'tr',
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
