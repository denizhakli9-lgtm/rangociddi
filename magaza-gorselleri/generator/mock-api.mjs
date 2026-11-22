/**
 * Answers the app's Supabase calls with the sample content from sample-data.mjs, inside the
 * screenshot browser only. The app itself is the normal production build: nothing in src/ is
 * changed, and no request ever reaches the real database (everything else is blocked).
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LOCATION, MEDIA_PATH, NOW, PROFILE, SETTINGS, CATEGORIES, USER_ID, slotsFor } from './sample-data.mjs';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
  'access-control-expose-headers': 'content-range',
};

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A signed-in session as supabase-js stores it; the token is never checked because every call is answered here. */
function sampleSession() {
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: PROFILE.email,
    email_confirmed_at: PROFILE.created_at,
    phone: '',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: PROFILE.created_at,
    updated_at: PROFILE.created_at,
  };
  const exp = 2082758400; // 2036
  const access_token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', email: PROFILE.email, exp, iat: Math.floor(Date.parse(NOW) / 1000) })}.ornek`;
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'ornek-refresh-token', user };
}

/** What the app keeps in localStorage: onboarding done, cookie notice read, chosen area, theme, language, session. */
export function storageEntries({ supabaseOrigin, cookieVersion, theme }) {
  const ref = new URL(supabaseOrigin).hostname.split('.')[0];
  const entries = {
    [`sb-${ref}-auth-token`]: JSON.stringify(sampleSession()),
    'veyra.onboarded': '1',
    'rango.cookie-notice': cookieVersion,
    'veyra.location': JSON.stringify(LOCATION),
    'rango-lang': 'tr',
    // -1 makes this visit show the first slogan ("Randevunun yeni yolu.").
    'rango.slogan': '-1',
  };
  // The app starts in light mode unless the visitor chose dark.
  if (theme === 'dark') entries['rango-theme'] = 'dark';
  return entries;
}

function km(aLat, aLng, bLat, bLng) {
  const rad = (d) => (d * Math.PI) / 180;
  const s = Math.sin(rad(bLat - aLat) / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

const publicBusiness = (b) => Object.fromEntries(Object.entries(b).filter(([key]) => !key.startsWith('_')));

function compare(cell, value) {
  const a = Date.parse(cell);
  const b = Date.parse(value);
  if (typeof cell === 'string' && Number.isFinite(a) && Number.isFinite(b) && /\d{4}-\d{2}-\d{2}/.test(value)) return a - b;
  if (Number.isFinite(Number(cell)) && Number.isFinite(Number(value))) return Number(cell) - Number(value);
  return String(cell).localeCompare(String(value));
}

/** The small part of PostgREST's filter syntax the app uses: eq, neq, in, is, gt(e), lt(e), order, limit. */
function query(rows, params) {
  let out = rows;
  for (const [key, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(key)) continue;
    const match = raw.match(/^(eq|neq|gt|gte|lt|lte|in|is)\.(.*)$/s);
    if (!match) continue;
    const [, op, value] = match;
    const list = op === 'in' ? value.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, '')) : [];
    out = out.filter((row) => {
      if (!(key in row)) return true;
      const cell = row[key];
      if (op === 'eq') return String(cell) === value;
      if (op === 'neq') return String(cell) !== value;
      if (op === 'in') return list.includes(String(cell));
      if (op === 'is') return value === 'null' ? cell == null : String(cell) === value;
      const diff = compare(cell, value);
      return op === 'gt' ? diff > 0 : op === 'gte' ? diff >= 0 : op === 'lt' ? diff < 0 : diff <= 0;
    });
  }
  const order = params.get('order');
  if (order) {
    const [column, direction] = order.split(',')[0].split('.');
    out = [...out].sort((a, b) => compare(a[column], b[column]) * (direction === 'desc' ? -1 : 1));
  }
  const limit = Number(params.get('limit'));
  return limit ? out.slice(0, limit) : out;
}

export async function installMockApi(context, { supabaseOrigin, data, publicDir }) {
  const tables = {
    categories: CATEGORIES,
    businesses: data.businesses.map(publicBusiness),
    services: data.services,
    employees: data.employees,
    working_hours: data.workingHours,
    reviews: data.reviews,
    platform_settings: [SETTINGS],
    profiles: [PROFILE],
    favorites: data.favorites.map((f) => ({ ...f, businesses: publicBusiness(f.businesses) })),
    appointments: data.appointments,
    notifications: data.notifications,
  };

  const rpc = {
    search_businesses(p) {
      const text = (p.p_query ?? '').toLocaleLowerCase('tr-TR');
      let list = data.businesses
        .filter((b) => !p.p_category || b.categories.slug === p.p_category)
        .filter((b) => !text || [b.name, b.district, b.description, b.categories.name].some((v) => v.toLocaleLowerCase('tr-TR').includes(text)))
        .filter((b) => !p.p_max_price || b.min_price <= p.p_max_price)
        .filter((b) => !p.p_min_rating || b.rating_avg >= p.p_min_rating)
        .filter((b) => !p.p_gender || b.gender_focus === p.p_gender || b.gender_focus === 'unisex')
        .filter((b) => !p.p_featured || b.is_featured)
        .map((b) => ({ business: publicBusiness(b), distance_km: km(p.p_lat ?? LOCATION.lat, p.p_lng ?? LOCATION.lng, b.latitude, b.longitude) }));
      const by = {
        mesafe: (a, b) => a.distance_km - b.distance_km,
        populer: (a, b) => b.business.booking_count - a.business.booking_count,
        puan: (a, b) => b.business.rating_avg - a.business.rating_avg || b.business.review_count - a.business.review_count,
        fiyat: (a, b) => a.business.min_price - b.business.min_price,
      };
      list = list.sort(by[p.p_sort] ?? by.mesafe);
      const total_count = list.length;
      const offset = p.p_offset ?? 0;
      return list.slice(offset, offset + (p.p_limit ?? 24)).map((row) => ({ ...row, total_count }));
    },
    category_stats() {
      return CATEGORIES.map((c) => {
        const own = data.businesses.filter((b) => b.category_id === c.id);
        return { category_id: c.id, business_count: own.length, min_price: own.length ? Math.min(...own.map((b) => b.min_price)) : null };
      });
    },
    get_available_slots(p) {
      const service = data.services.find((s) => s.id === p.p_service);
      if (!service) return [];
      const staff = p.p_employee
        ? [p.p_employee]
        : data.employees.filter((e) => e.business_id === service.business_id && e.employee_services.some((es) => es.service_id === service.id)).map((e) => e.id);
      return staff.length ? slotsFor(p.p_date, staff, service.duration_minutes) : [];
    },
    generate_my_reminders: () => 0,
  };

  const json = (route, body, extra = {}) =>
    route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', ...extra }, body: JSON.stringify(body) });

  // Anything that is neither the local app nor the mocked backend is refused (web sockets too).
  await context.routeWebSocket(() => true, (socket) => socket.close());
  await context.route(
    (url) => /^https?:$/.test(url.protocol) && !['localhost', '127.0.0.1'].includes(url.hostname) && url.origin !== supabaseOrigin,
    (route) => route.abort(),
  );

  await context.route(
    (url) => url.origin === supabaseOrigin,
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });

      if (url.pathname.startsWith(MEDIA_PATH)) {
        const file = url.pathname.split('/').pop();
        if (!/^[a-z0-9-]+\.webp$/.test(file)) return route.fulfill({ status: 404, headers: CORS });
        return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/webp' }, body: await readFile(join(publicDir, file)) });
      }

      if (url.pathname.startsWith('/auth/v1/')) {
        const session = sampleSession();
        if (url.pathname.endsWith('/user')) return json(route, session.user);
        if (url.pathname.endsWith('/token')) return json(route, session);
        return json(route, {});
      }

      const rpcName = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
      if (rpcName) {
        const handler = rpc[rpcName];
        if (!handler) console.warn(`[mock-api] yanıtı tanımlı olmayan fonksiyon: ${rpcName}`);
        return json(route, handler ? handler(request.postDataJSON() ?? {}) : null);
      }

      const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/)?.[1];
      if (table) {
        if (!(table in tables)) console.warn(`[mock-api] yanıtı tanımlı olmayan tablo: ${table}`);
        if (method !== 'GET' && method !== 'HEAD') return json(route, []);
        const rows = query(tables[table] ?? [], url.searchParams);
        const range = { 'content-range': rows.length ? `0-${rows.length - 1}/${rows.length}` : `*/0` };
        if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...CORS, ...range } });
        if ((request.headers().accept ?? '').includes('vnd.pgrst.object')) {
          return rows.length ? json(route, rows[0], range) : route.fulfill({ status: 406, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) });
        }
        return json(route, rows, range);
      }

      console.warn(`[mock-api] yanıtsız istek: ${method} ${url.pathname}`);
      return json(route, {});
    },
  );
}
