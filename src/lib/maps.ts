import { ALL_DISTRICTS, cityAt, cityByName, isInCityBounds } from '@/lib/cities';

export interface MapTarget {
  name: string;
  address: string;
  district?: string | null;
  city?: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface Coords {
  latitude: number;
  longitude: number;
}

export type MapApp = 'google' | 'apple' | 'yandex';

/** True when the point lies in the given city, or (no city given) in any of our cities. */
export function isInCity({ latitude, longitude }: Coords, city: string | null | undefined): boolean {
  if (!city) return !!cityAt(latitude, longitude);
  const c = cityByName(city);
  return !!c && isInCityBounds(c, latitude, longitude);
}

/** True when the coordinates are just the district centre rather than a pin the owner placed. */
export function isDistrictCentre(c: { latitude: number | null; longitude: number | null }): boolean {
  if (c.latitude == null || c.longitude == null) return true;
  return ALL_DISTRICTS.some(({ district: d }) => Math.abs(d.lat - c.latitude!) < 0.00005 && Math.abs(d.lng - c.longitude!) < 0.00005);
}

export function hasExactPin(t: { latitude: number | null; longitude: number | null }): t is Coords {
  return !isDistrictCentre(t);
}

function valid(lat: number, lng: number): Coords | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: Math.round(lat * 1e6) / 1e6, longitude: Math.round(lng * 1e6) / 1e6 };
}

export type ParseResult = { ok: true; coords: Coords } | { ok: false; reason: 'short' | 'unreadable' };

export function parseLocationInput(raw: string): ParseResult {
  const text = raw.trim();
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text)) return { ok: false, reason: 'short' };
  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    /* keep raw text */
  }
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`!3d${num}!4d${num}`),
    new RegExp(`[?&](?:q|query|destination|daddr|ll|center)=${num}\\s*,\\s*${num}`),
    new RegExp(`@${num},${num}`),
    new RegExp(`^${num}\\s*,\\s*${num}$`),
  ];
  for (const p of patterns) {
    const m = decoded.match(p);
    if (m) {
      const c = valid(Number(m[1]), Number(m[2]));
      if (c) return { ok: true, coords: c };
    }
  }
  const rtext = decoded.match(new RegExp(`rtext=[^&]*~${num},${num}`));
  if (rtext) {
    const c = valid(Number(rtext[1]), Number(rtext[2]));
    if (c) return { ok: true, coords: c };
  }
  return { ok: false, reason: 'unreadable' };
}

export function fullAddress(t: MapTarget): string {
  return [t.address, t.district, t.city ?? 'İzmir'].filter(Boolean).join(', ');
}

export function directionsUrl(app: MapApp, t: MapTarget): string {
  const pin = hasExactPin(t) ? `${t.latitude},${t.longitude}` : null;
  const query = encodeURIComponent(pin ?? `${t.name}, ${fullAddress(t)}`);
  switch (app) {
    case 'google':
      return `https://www.google.com/maps/dir/?api=1&destination=${query}`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${query}`;
    case 'yandex':
      return pin ? `https://yandex.com.tr/harita/?rtext=~${pin}&rtt=auto` : `https://yandex.com.tr/harita/?text=${query}`;
  }
}

export function viewUrl(c: Coords): string {
  return `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`;
}
