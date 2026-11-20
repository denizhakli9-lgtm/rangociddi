import { supabase } from '@/lib/supabase';

/** Error from one of Rango's Edge Functions: `message` holds the VEYRA_* code, `detail` an optional provider message. */
export class EdgeFunctionError extends Error {
  detail: string | null;
  constructor(code: string, detail: string | null = null) {
    super(code);
    this.name = 'EdgeFunctionError';
    this.detail = detail;
  }
}

/**
 * Calls a Rango Edge Function with the signed-in user's session. Our functions answer errors as
 * `{ error: 'VEYRA_...', detail? }`; that code becomes the thrown error's message, so friendlyError()
 * shows the matching translated text.
 */
export async function invokeEdge<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = '';
    let detail: string | null = null;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const payload = await context.clone().json().catch(() => null) as { error?: unknown; detail?: unknown } | null;
      if (typeof payload?.error === 'string') code = payload.error;
      if (typeof payload?.detail === 'string') detail = payload.detail;
    }
    throw new EdgeFunctionError(code || error.message || 'VEYRA_UNKNOWN', detail);
  }
  return data as T;
}
