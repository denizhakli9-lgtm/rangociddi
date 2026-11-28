import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Clock, LocateFixed, MapPin, Search, Sparkles } from 'lucide-react';
import { ALL_DISTRICTS, CITY_LIST, areaAt, cityOrDefault, type City } from '@/lib/cities';
import { useOpenCities } from '@/lib/useOpenCities';
import { locativeTr } from '@/lib/seo/places';
import { useUserLocation } from '@/contexts/LocationContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';
import { getDevicePosition } from '@/lib/platform';
import { tx } from '@/i18n/locale';

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
const fold = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/[çğıöşü]/g, (c) => FOLD[c] ?? c);

/** "İstanbul, Ankara ve Bursa" */
function joinNames(cities: City[], and: string): string {
  const names = cities.map((c) => c.name);
  return names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

type Availability = 'open' | 'soon';

function CityChip({ city, availability, selected, current, onClick }: { city: City; availability: Availability; selected: boolean; current: boolean; onClick: () => void }) {
  const look = selected
    ? 'border-gold-500/70 bg-gold-500/10 text-white'
    : availability === 'open'
      ? 'border-line bg-coal text-mist hover:border-white/40 hover:text-white'
      : 'border-dashed border-gold-500/40 text-mist hover:border-gold-500/70 hover:text-white';
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors ${look}`}>
      {city.name}
      {current && <span className="h-1.5 w-1.5 rounded-full bg-gold-400" aria-label={tx('seçili konum', 'current location')} />}
    </button>
  );
}

export default function LocationSelect() {
  const { location, setLocation } = useUserLocation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [cityName, setCityName] = useState(() => cityOrDefault(location.city).name);
  const city = cityOrDefault(cityName);
  const { isOpen } = useOpenCities();
  // A "soon" city opens by itself once its first business is live (src/lib/useOpenCities.ts).
  const availability = (c: City): Availability => (isOpen(c) ? 'open' : 'soon');
  const open = CITY_LIST.filter((c) => availability(c) === 'open');
  const soon = CITY_LIST.filter((c) => availability(c) === 'soon');
  const openTr = joinNames(open, 've');
  const openEn = joinNames(open, 'and');
  const cityAvailability = availability(city);

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
        const nearest = areaAt(latitude, longitude);
        // Only the matched district centre is kept, never the exact device fix,
        // so a precise home address is never stored on the account.
        if (nearest && !isOpen(nearest.city)) {
          setCityName(nearest.city.name);
          setQuery('');
          toast(tx(`Rango ${locativeTr(nearest.city.name)} çok yakında! Şimdilik ${locativeTr(openTr)} randevu alabilirsiniz.`, `Rango is coming to ${nearest.city.name} very soon! For now you can book in ${openEn}.`), 'info');
        } else if (nearest) {
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
    : cityAvailability === 'open'
      ? city.districts.map((district) => ({ city, district }))
      : [];
  const selectCity = (c: City) => {
    setCityName(c.name);
    setQuery('');
  };

  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] text-white">{tx('Konumunuzu seçin', 'Choose your location')}</h1>
      <p className="mt-2 text-sm text-mist">{tx(
          `Size en yakın işletmeleri göstermek için konumunuzu seçin. Rango şu an ${locativeTr(openTr)} hizmet veriyor${soon.length ? `; ${joinNames(soon, 've')} çok yakında` : ''}.`,
          `Choose your location to see the businesses nearest to you. Rango currently serves ${openEn}${soon.length ? `; ${joinNames(soon, 'and')} ${soon.length === 1 ? 'is' : 'are'} coming very soon` : ''}.`,
        )}</p>

      <Button variant="outline" full size="lg" className="mt-8" loading={locating} icon={<LocateFixed className="h-4 w-4" />} onClick={useDevice}>
        {tx('Mevcut konumumu kullan', 'Use my current location')}
      </Button>
      <p className="mt-2 text-xs leading-relaxed text-mist-2">{tx('Konumunuz yalnızca size en yakın semti bulmak için cihazınızda kullanılır; tam konumunuz saklanmaz, yalnızca seçilen semt kaydedilir.', 'Your location is only used on your device to find the nearest area; your exact position is never stored, only the chosen area.')}</p>

      <div role="group" aria-label={tx('Şehir', 'City')} className="mt-8">
        <p className="text-[13px] font-medium text-mist-2">{open.length > 1 ? tx('Hizmet verdiğimiz şehirler', 'Cities we serve') : tx('Hizmet verdiğimiz şehir', 'City we serve')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {open.map((c) => <CityChip key={c.name} city={c} availability="open" selected={c.name === city.name} current={location.city === c.name} onClick={() => selectCity(c)} />)}
        </div>
        {soon.length > 0 && (
          <>
            <p className="mt-5 flex items-center gap-1.5 text-[13px] font-medium text-gold-400"><Clock className="h-3.5 w-3.5" />{tx('Çok yakında', 'Coming very soon')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {soon.map((c) => <CityChip key={c.name} city={c} availability="soon" selected={c.name === city.name} current={false} onClick={() => selectCity(c)} />)}
            </div>
          </>
        )}
      </div>

      <div className="relative mt-5">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-2" />
        <input aria-label={tx('Semt veya şehir ara', 'Search areas or cities')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={cityAvailability === 'open' ? tx(`${city.name} içinde semt ara`, `Search areas in ${city.name}`) : tx('Semt veya şehir ara', 'Search areas or cities')} className="h-12 w-full rounded-xl border border-line bg-coal pl-11 pr-4 text-sm text-white placeholder:text-mist-3 focus:border-gold-500/60 focus:outline-none" />
      </div>

      {!q && cityAvailability === 'soon' ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-gold-500/40 bg-gold-500/[0.06] px-6 py-9 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gold-500/15">
            <Sparkles className="h-6 w-6 text-gold-400" />
          </span>
          <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-gold-400">{tx('Çok yakında', 'Coming very soon')}</p>
          <h2 className="mt-1.5 font-display text-[26px] leading-tight text-white">{tx(`Rango ${locativeTr(city.name)} çok yakında!`, `Rango is coming to ${city.name}!`)}</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-mist">
            {tx(
              `${locativeTr(city.name)}ki kuaför, berber ve güzellik salonlarını Rango’ya taşıyoruz. Çok yakında buradan birkaç dokunuşla randevu alabileceksiniz.`,
              `We are bringing ${city.name}’s hair, barber and beauty salons to Rango. Very soon you will be able to book them here in a few taps.`,
            )}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-mist-2">{tx(`O zamana kadar ${locativeTr(openTr)} randevu alabilirsiniz.`, `Until then, you can book in ${openEn}.`)}</p>
          <div className="mt-6 flex flex-col items-center gap-1">
            {open[0] && (
              <Button variant="outline" onClick={() => selectCity(open[0])}>
                {tx(`${open[0].name} semtlerini gör`, `See areas in ${open[0].name}`)}
              </Button>
            )}
            <Link to="/isletmeler-icin" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-white underline-offset-4 hover:underline">
              {tx(`İşletmeniz ${locativeTr(city.name)} ${locativeTr(city.name).endsWith('a') ? 'mı' : 'mi'}? Şimdiden katılın`, `Business in ${city.name}? Join now`)} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : (
      <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">
        {list.map(({ city: c, district: d }) => {
          const active = location.city === c.name && location.label === d.name;
          const state = availability(c);
          if (state !== 'open') {
            return (
              <div key={`${c.name}/${d.name}`} aria-disabled="true" className="flex w-full items-center gap-3 px-5 py-4 opacity-60">
                <MapPin className="h-4 w-4 text-mist-3" />
                <span className="flex-1">
                  <span className="block text-sm text-white">{d.name}</span>
                  <span className="text-xs text-mist-2">{c.name}</span>
                </span>
                <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-medium text-mist-2">{tx('Çok yakında', 'Very soon')}</span>
              </div>
            );
          }
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
      )}
    </div>
  );
}
