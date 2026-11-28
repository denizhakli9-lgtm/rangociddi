import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LocateFixed, MapPin, Search } from 'lucide-react';
import { ALL_DISTRICTS, CITY_LIST, SERVICE_RADIUS_KM, cityOrDefault, nearestArea } from '@/lib/cities';
import { useUserLocation } from '@/contexts/LocationContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { getDevicePosition } from '@/lib/platform';
import { tx } from '@/i18n/locale';

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => FOLD[c] ?? c);

export default function LocationSelect() {
  const { location, setLocation } = useUserLocation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [cityName, setCityName] = useState(() => cityOrDefault(location.city).name);
  const city = cityOrDefault(cityName);

  const choose = async (label: string, cityLabel: string, lat: number, lng: number) => {
    await setLocation({ label, city: cityLabel, lat, lng });
    toast(tx(`Konum ${label}, ${cityLabel} olarak ayarlandı`, `Location set to ${label}, ${cityLabel}`), 'success');
    // Opened directly (shared link, new tab): there is no in-app page to go back to.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/kesfet', { replace: true });
  };

  const useDevice = () => {
    setLocating(true);
    getDevicePosition({ highAccuracy: false, timeout: 10000 }).then(
      ({ latitude, longitude }) => {
        setLocating(false);
        const nearest = nearestArea(latitude, longitude);
        // Only the matched district centre is kept, never the exact device fix,
        // so a precise home address is never stored on the account.
        if (nearest.km < SERVICE_RADIUS_KM) {
          choose(`${nearest.district.name} (${tx('Konumum', 'My location')})`, nearest.city.name, nearest.district.lat, nearest.district.lng);
        } else {
          toast(tx('Konumunuz hizmet verdiğimiz şehirlerin dışında görünüyor. Lütfen listeden bir şehir ve semt seçin.', 'You seem to be outside the cities we serve. Please choose a city and area from the list.'), 'error');
        }
      },
      (err) => {
        setLocating(false);
        toast(err === 'unsupported' ? tx('Tarayıcınız konum özelliğini desteklemiyor.', 'Your browser does not support location.') : tx('Konum izni alınamadı. Lütfen listeden bir semt seçin.', 'Location permission was not granted. Please choose an area from the list.'), 'error');
      },
    );
  };

  // Accent-insensitive, so "karsiyaka" also finds Karşıyaka. A search looks through every city
  // (by district or city name); without one, the chosen city's districts are listed.
  const q = fold(query.trim());
  const list = q
    ? ALL_DISTRICTS.filter((e) => fold(e.district.name).includes(q) || fold(e.city.name).includes(q))
    : city.districts.map((district) => ({ city, district }));

  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] text-white">{tx('Konumunuzu seçin', 'Choose your location')}</h1>
      <p className="mt-2 text-sm text-mist">{tx(`Size en yakın işletmeleri göstermek için konumunuzu seçin. Rango Türkiye’nin en kalabalık ${CITY_LIST.length} şehrinde hizmet veriyor.`, `Choose your location to see the businesses nearest to you. Rango serves Türkiye’s ${CITY_LIST.length} most populous cities.`)}</p>

      <Button variant="outline" full size="lg" className="mt-8" loading={locating} icon={<LocateFixed className="h-4 w-4" />} onClick={useDevice}>
        {tx('Mevcut konumumu kullan', 'Use my current location')}
      </Button>
      <p className="mt-2 text-xs leading-relaxed text-mist-2">{tx('Konumunuz yalnızca size en yakın semti bulmak için cihazınızda kullanılır; tam konumunuz saklanmaz, yalnızca seçilen semt kaydedilir.', 'Your location is only used on your device to find the nearest area; your exact position is never stored, only the chosen area.')}</p>

      <div className="mt-8">
        <p id="city-label" className="text-[13px] font-medium text-mist-2">{tx('Şehir', 'City')}</p>
        <div role="radiogroup" aria-labelledby="city-label" className="no-scrollbar -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {CITY_LIST.map((c) => {
            const selected = c.name === city.name;
            return (
              <button
                key={c.name}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => { setCityName(c.name); setQuery(''); }}
                className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${selected ? 'border-gold-500/70 bg-gold-500/10 text-white' : 'border-line bg-coal text-mist hover:border-white/40 hover:text-white'}`}
              >
                {c.name}
                {location.city === c.name && <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-label={tx('seçili konum', 'current location')} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-2" />
        <input aria-label={tx('Semt veya şehir ara', 'Search areas or cities')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx(`${city.name} içinde semt ara`, `Search areas in ${city.name}`)} className="h-12 w-full rounded-xl border border-line bg-coal pl-11 pr-4 text-sm text-white placeholder:text-mist-3 focus:border-gold-500/60 focus:outline-none" />
      </div>

      <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">
        {list.map(({ city: c, district: d }) => {
          const active = location.city === c.name && location.label === d.name;
          return (
            <button key={`${c.name}/${d.name}`} type="button" aria-current={active ? 'true' : undefined} onClick={() => choose(d.name, c.name, d.lat, d.lng)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03]">
              <MapPin className={`h-4 w-4 ${active ? 'text-gold-400' : 'text-mist-2'}`} />
              <span className="flex-1">
                <span className="block text-sm text-white">{d.name}</span>
                <span className="text-xs text-mist-2">{c.name}</span>
              </span>
              {active && <Check className="h-4 w-4 text-gold-400" />}
            </button>
          );
        })}
        {!list.length && <p className="px-5 py-6 text-center text-sm text-mist-2">{tx('Bu isimde bir semt veya şehir bulunamadı.', 'No area or city found with this name.')}</p>}
      </div>
    </div>
  );
}
