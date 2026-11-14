export interface District {
  name: string;
  lat: number;
  lng: number;
}

export const IZMIR_CENTER: District = { name: 'Konak', lat: 38.4189, lng: 27.1287 };

export const IZMIR_DISTRICTS: District[] = [
  { name: 'Alsancak', lat: 38.4375, lng: 27.1435 },
  { name: 'Konak', lat: 38.4189, lng: 27.1287 },
  { name: 'Karşıyaka', lat: 38.4594, lng: 27.1153 },
  { name: 'Bostanlı', lat: 38.4561, lng: 27.0975 },
  { name: 'Bornova', lat: 38.4697, lng: 27.2211 },
  { name: 'Bayraklı', lat: 38.4622, lng: 27.1667 },
  { name: 'Buca', lat: 38.3886, lng: 27.1756 },
  { name: 'Karabağlar', lat: 38.3739, lng: 27.1286 },
  { name: 'Göztepe', lat: 38.3969, lng: 27.0848 },
  { name: 'Balçova', lat: 38.3897, lng: 27.0497 },
  { name: 'Narlıdere', lat: 38.3947, lng: 27.0019 },
  { name: 'Gaziemir', lat: 38.3197, lng: 27.1336 },
  { name: 'Çiğli', lat: 38.4961, lng: 27.0697 },
  { name: 'Güzelbahçe', lat: 38.3706, lng: 26.8906 },
  { name: 'Urla', lat: 38.3228, lng: 26.7647 },
  { name: 'Çeşme', lat: 38.3236, lng: 26.3036 },
];

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`;
}
