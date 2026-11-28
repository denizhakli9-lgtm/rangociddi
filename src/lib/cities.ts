/**
 * Rango'nun şehirleri ve her şehrin en hareketli semtleri: Türkiye'nin en kalabalık dört
 * büyükşehri, nüfusa göre sıralı (TÜİK ADNKS, 31.12.2024; yuvarlanmış). Semt listesi her şehrin
 * kalabalık, çarşısı ve kuaför/berber yoğunluğu yüksek merkez ilçe ve semtleridir; tam ilçe
 * listesi değildir. Koordinatlar semt merkezinin yaklaşık konumudur: en yakın işletmeleri
 * sıralamak ve işletme sahibi konum işaretlemediğinde haritada göstermek için kullanılır.
 *
 * Önemli: işletmelerin `district` alanı buradaki adlarla birebir eşleşir. Var olan bir semtin
 * adını değiştirmek o semtteki işletmelerin eşleşmesini bozar; yeni semt eklemek güvenlidir.
 */
import { distanceKm, type District } from './geo';

/**
 * - `open`: müşteriler konum seçip randevu alabilir, işletmeler kayıt olabilir.
 * - `soon`: işletmeler kayıt olabilir; müşterilere "Çok yakında" mesajı gösterilir ve şehirde
 *   onaylı ilk gerçek işletme yayına girdiği an müşterilere kendiliğinden açılır
 *   (src/lib/useOpenCities.ts).
 */
export type CityStatus = 'open' | 'soon';

export interface City {
  name: string;
  /** Plaka kodu. */
  plate: number;
  /** Nüfus, milyon (yaklaşık). */
  population: number;
  status: CityStatus;
  /** Şehir merkezi: konum seçilmemişken kullanılan nokta. */
  center: District;
  districts: District[];
}

const d = (name: string, lat: number, lng: number): District => ({ name, lat, lng });

export const CITY_LIST: City[] = [
  {
    name: 'İstanbul',
    plate: 34,
    population: 15.7,
    status: 'soon',
    center: d('Şişli', 41.06, 28.987),
    districts: [
      d('Kadıköy', 40.9906, 29.029),
      d('Beşiktaş', 41.043, 29.007),
      d('Şişli', 41.06, 28.987),
      d('Nişantaşı', 41.051, 28.994),
      d('Beyoğlu', 41.037, 28.977),
      d('Üsküdar', 41.026, 29.015),
      d('Ataşehir', 40.992, 29.124),
      d('Bakırköy', 40.98, 28.872),
      d('Fatih', 41.019, 28.94),
      d('Sarıyer', 41.167, 29.05),
      d('Maltepe', 40.935, 29.13),
      d('Kartal', 40.889, 29.19),
      d('Pendik', 40.877, 29.235),
      d('Ümraniye', 41.016, 29.125),
      d('Kağıthane', 41.08, 28.97),
      d('Eyüpsultan', 41.048, 28.934),
      d('Bahçelievler', 41.001, 28.86),
      d('Bağcılar', 41.039, 28.857),
      d('Küçükçekmece', 41.0, 28.78),
      d('Başakşehir', 41.093, 28.802),
      d('Beylikdüzü', 40.982, 28.64),
      d('Esenyurt', 41.034, 28.68),
    ],
  },
  {
    name: 'Ankara',
    plate: 6,
    population: 5.86,
    status: 'soon',
    center: d('Kızılay', 39.9208, 32.8541),
    districts: [
      d('Kızılay', 39.9208, 32.8541),
      d('Tunalı', 39.9045, 32.8606),
      d('Çankaya', 39.8936, 32.8597),
      d('Bahçelievler', 39.922, 32.824),
      d('Çayyolu', 39.884, 32.683),
      d('Ümitköy', 39.892, 32.7),
      d('Yenimahalle', 39.97, 32.81),
      d('Batıkent', 39.97, 32.73),
      d('Keçiören', 39.99, 32.865),
      d('Etimesgut', 39.945, 32.67),
      d('Eryaman', 39.975, 32.638),
      d('Mamak', 39.93, 32.915),
      d('Sincan', 39.97, 32.58),
      d('Gölbaşı', 39.79, 32.805),
      d('Pursaklar', 40.035, 32.9),
    ],
  },
  {
    name: 'İzmir',
    plate: 35,
    population: 4.49,
    status: 'open',
    center: d('Konak', 38.4189, 27.1287),
    // Pilot şehrin listesi: kayıtlı işletmeler bu adları kullanıyor, sıra ve adlar korunmalı.
    districts: [
      d('Alsancak', 38.4375, 27.1435),
      d('Konak', 38.4189, 27.1287),
      d('Karşıyaka', 38.4594, 27.1153),
      d('Bostanlı', 38.4561, 27.0975),
      d('Bornova', 38.4697, 27.2211),
      d('Bayraklı', 38.4622, 27.1667),
      d('Buca', 38.3886, 27.1756),
      d('Karabağlar', 38.3739, 27.1286),
      d('Göztepe', 38.3969, 27.0848),
      d('Balçova', 38.3897, 27.0497),
      d('Narlıdere', 38.3947, 27.0019),
      d('Gaziemir', 38.3197, 27.1336),
      d('Çiğli', 38.4961, 27.0697),
      d('Güzelbahçe', 38.3706, 26.8906),
      d('Urla', 38.3228, 26.7647),
      d('Çeşme', 38.3236, 26.3036),
    ],
  },
  {
    name: 'Bursa',
    plate: 16,
    population: 3.24,
    status: 'soon',
    center: d('Osmangazi', 40.195, 29.06),
    districts: [
      d('Nilüfer', 40.215, 28.985),
      d('Osmangazi', 40.195, 29.06),
      d('Yıldırım', 40.188, 29.115),
      d('Görükle', 40.228, 28.845),
      d('Kestel', 40.198, 29.212),
      d('Mudanya', 40.375, 28.883),
      d('Gemlik', 40.432, 29.156),
      d('İnegöl', 40.078, 29.51),
    ],
  },
];

/** Cities where businesses can sign up: all of them, including those opening soon. */
export const REGISTRATION_CITIES = CITY_LIST;

export function acceptsBusinesses(city: City | undefined): boolean {
  return !!city;
}

/** Pilot şehir: eski kayıtlarda şehir bilgisi yoksa bu kabul edilir. */
export const DEFAULT_CITY_NAME = 'İzmir';

export function cityByName(name: string | null | undefined): City | undefined {
  if (!name) return undefined;
  return CITY_LIST.find((c) => c.name.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'));
}

/** The city, falling back to the pilot city for records saved before cities existed. */
export function cityOrDefault(name: string | null | undefined): City {
  return cityByName(name) ?? cityByName(DEFAULT_CITY_NAME)!;
}

export function findCityDistrict(cityName: string | null | undefined, districtName: string | null | undefined): District | undefined {
  if (!districtName) return undefined;
  return cityOrDefault(cityName).districts.find((x) => x.name === districtName);
}

/** Every district of every city, with its city: for search and nearest-area lookups. */
export const ALL_DISTRICTS: { city: City; district: District }[] = CITY_LIST.flatMap((city) => city.districts.map((district) => ({ city, district })));

/** The closest known district to a point, across every city. */
export function nearestArea(lat: number, lng: number): { city: City; district: District; km: number } {
  let best = { ...ALL_DISTRICTS[0], km: Infinity };
  for (const entry of ALL_DISTRICTS) {
    const km = distanceKm(lat, lng, entry.district.lat, entry.district.lng);
    if (km < best.km) best = { ...entry, km };
  }
  return best;
}

/** How far from its nearest listed district a point may be and still count as inside a city. */
export const SERVICE_RADIUS_KM = 40;
