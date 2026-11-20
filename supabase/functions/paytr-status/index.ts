import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

/**
 * PayTR reconciliation for one booking: asks PayTR's status service (Durum Sorgu) about the signed-in
 * customer's recent unfinished PayTR orders and applies a successful payment exactly like the payment
 * notification would (public.paytr_apply_callback is idempotent). This keeps the booking correct when the
 * notification is late or the Bildirim URL is misconfigured. PayTR is the only source of truth here: the
 * customer cannot mark anything paid, and each order is checked at most once per 10 seconds.
 * Secrets: PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();

async function hmacBase64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message)));
  return btoa(String.fromCharCode(...signature));
}

/** PayTR returns amounts like "10,8" or "10.80"; anything else is ignored (the signed order amount is used). */
function parseAmountKurus(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value !== 'string' || !/^\d+([.,]\d{1,2})?$/.test(value.trim())) return null;
  return Math.round(Number(value.trim().replace(',', '.')) * 100);
}

Deno.serve(async (req: Request) => {
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'VEYRA_INVALID_INPUT' }, 405);

  try {
    const merchantId = Deno.env.get('PAYTR_MERCHANT_ID')?.trim();
    const merchantKey = Deno.env.get('PAYTR_MERCHANT_KEY')?.trim();
    const merchantSalt = Deno.env.get('PAYTR_MERCHANT_SALT')?.trim();
    if (!merchantId || !merchantKey || !merchantSalt) return reply({ error: 'VEYRA_PROVIDER_REQUIRED' }, 503);

    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth, error: authError } = await client.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) return reply({ error: 'VEYRA_AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => null) as { appointment?: unknown } | null;
    const appointment = typeof body?.appointment === 'string' ? body.appointment : '';
    if (!UUID.test(appointment)) return reply({ error: 'VEYRA_INVALID_INPUT' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: orders, error: ordersError } = await admin.rpc('paytr_orders_to_check', { p_user: auth.user.id, p_appointment: appointment });
    if (ordersError) {
      console.error('paytr-status: orders_to_check failed', ordersError);
      return reply({ error: 'VEYRA_PAYMENT_PROVIDER' }, 500);
    }

    let result = 'pending';
    for (const order of (orders ?? []) as { merchant_oid: string; amount_kurus: number }[]) {
      const paytrToken = await hmacBase64(merchantKey, merchantId + order.merchant_oid + merchantSalt);
      const response = await fetch('https://www.paytr.com/odeme/durum-sorgu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ merchant_id: merchantId, merchant_oid: order.merchant_oid, paytr_token: paytrToken }),
        signal: AbortSignal.timeout(15000),
      }).catch((err) => {
        console.error('paytr-status: durum-sorgu request failed', order.merchant_oid, err);
        return null;
      });
      const status = await response?.json().catch(() => null) as { status?: string; payment_amount?: unknown; test_mode?: unknown; err_no?: unknown } | null;
      // "success" means PayTR holds a successful payment for this order; "error" 004 means there is none (yet).
      if (status?.status !== 'success') {
        console.log('paytr-status: no successful payment', order.merchant_oid, status?.status ?? 'no response', status?.err_no ?? '');
        continue;
      }

      const paid = parseAmountKurus(status.payment_amount);
      const { data: applied, error: applyError } = await admin.rpc('paytr_apply_callback', {
        p_oid: order.merchant_oid,
        p_success: true,
        p_amount_kurus: paid ?? order.amount_kurus,
        p_reason: 'durum-sorgu',
        p_test: String(status.test_mode ?? '') === '1',
      });
      if (applyError) {
        console.error('paytr-status: apply failed', order.merchant_oid, applyError);
        continue;
      }
      result = String(applied);
      if (applied === 'paid' || applied === 'refund_queued' || applied === 'duplicate') break;
    }

    return reply({ result });
  } catch (err) {
    console.error('paytr-status: unexpected error', err);
    return reply({ error: 'VEYRA_PAYMENT_PROVIDER' }, 500);
  }
});
