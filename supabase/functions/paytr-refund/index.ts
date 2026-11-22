import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

/**
 * Admin approves a refund of a PayTR payment: sends the refund to PayTR's İade API, then marks the refund
 * request approved (admin_resolve_refund, run as the admin). A refund is sent at most once per refund
 * request: private.paytr_refunds records each attempt with reference_no = request id, and an interrupted
 * attempt is checked with PayTR's status service (Durum Sorgu) before anything is sent again.
 * Secrets: PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT.
 * Supabase provides SUPABASE_URL, SUPABASE_PUBLISHABLE_KEYS and SUPABASE_SECRET_KEYS itself.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

const codeOf = (message: string | undefined) => message?.match(/VEYRA_[A-Z0-9_]+/)?.[0];

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

    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, supabaseKey('SUPABASE_PUBLISHABLE_KEYS'), {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user || auth.user.is_anonymous) return reply({ error: 'VEYRA_AUTH_REQUIRED' }, 401);

    const body = await req.json().catch(() => null) as { request?: unknown; note?: unknown } | null;
    const request = typeof body?.request === 'string' ? body.request : '';
    if (!UUID.test(request)) return reply({ error: 'VEYRA_INVALID_INPUT' }, 400);
    const note = typeof body?.note === 'string' ? body.note.slice(0, 500) : '';

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, supabaseKey('SUPABASE_SECRET_KEYS'));
    // Checks the caller is an admin, the request is pending and belongs to a PayTR payment, and claims it.
    const { data: refund, error: beginError } = await admin.rpc('paytr_refund_begin', { p_admin: auth.user.id, p_request: request });
    if (beginError) {
      const code = codeOf(beginError.message);
      if (!code) console.error('paytr-refund: begin failed', beginError);
      return reply({ error: code ?? 'VEYRA_REFUND_PROVIDER' }, code ? 400 : 500);
    }

    if (refund.status !== 'sent') {
      let alreadyAccepted = false;
      if (refund.previous_status !== 'none') {
        // An earlier attempt failed or was interrupted: PayTR lists accepted refunds with our reference_no.
        const statusToken = await hmacBase64(merchantKey, merchantId + refund.merchant_oid + merchantSalt);
        const statusResponse = await fetch('https://www.paytr.com/odeme/durum-sorgu', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ merchant_id: merchantId, merchant_oid: refund.merchant_oid, paytr_token: statusToken }),
          signal: AbortSignal.timeout(20000),
        }).catch(() => null);
        const status = await statusResponse?.json().catch(() => null) as { status?: string; returns?: unknown } | null;
        if (!status || (status.status !== 'success' && status.status !== 'error')) {
          return reply({ error: 'VEYRA_REFUND_UNKNOWN' }, 502);
        }
        alreadyAccepted = Array.isArray(status.returns)
          && status.returns.some((r) => typeof r === 'object' && r !== null && (r as { reference_no?: unknown }).reference_no === refund.reference_no);
      }

      if (!alreadyAccepted) {
        const paytrToken = await hmacBase64(merchantKey, merchantId + refund.merchant_oid + refund.return_amount + merchantSalt);
        let result: { status?: string; err_no?: string; err_msg?: string } | null = null;
        try {
          const response = await fetch('https://www.paytr.com/odeme/iade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              merchant_id: merchantId,
              merchant_oid: refund.merchant_oid,
              return_amount: refund.return_amount,
              paytr_token: paytrToken,
              reference_no: refund.reference_no,
            }),
            signal: AbortSignal.timeout(60000),
          });
          result = await response.json().catch(() => null);
        } catch (err) {
          // Unknown outcome (timeout / network): keep the attempt as "sending"; a retry checks PayTR first.
          console.error('paytr-refund: iade request failed', refund.merchant_oid, err);
          return reply({ error: 'VEYRA_REFUND_UNKNOWN' }, 502);
        }
        if (result?.status !== 'success') {
          const detail = [result?.err_no, result?.err_msg].filter(Boolean).join(' - ') || 'PayTR iade isteğini kabul etmedi';
          console.error('paytr-refund: PayTR refused the refund', refund.merchant_oid, detail);
          await admin.rpc('paytr_refund_finish', { p_request: request, p_sent: false, p_error: detail });
          return reply({ error: 'VEYRA_REFUND_PROVIDER', detail }, 502);
        }
      }

      const { error: finishError } = await admin.rpc('paytr_refund_finish', { p_request: request, p_sent: true, p_error: null });
      if (finishError) {
        console.error('paytr-refund: finish failed after PayTR accepted the refund', request, finishError);
        return reply({ error: 'VEYRA_REFUND_UNKNOWN', refunded: true }, 500);
      }
    }

    // As the admin: admin_resolve_refund checks auth.uid() and requires the PayTR refund to be recorded as sent.
    const { error: resolveError } = await userClient.rpc('admin_resolve_refund', { p_request: request, p_approve: true, p_note: note });
    if (resolveError) {
      console.error('paytr-refund: resolve failed after the PayTR refund', request, resolveError);
      return reply({ error: codeOf(resolveError.message) ?? 'VEYRA_REFUND_UNKNOWN', refunded: true }, 500);
    }
    return reply({ ok: true, test: refund.test_mode === true });
  } catch (err) {
    console.error('paytr-refund: unexpected error', err);
    return reply({ error: 'VEYRA_REFUND_UNKNOWN' }, 500);
  }
});
