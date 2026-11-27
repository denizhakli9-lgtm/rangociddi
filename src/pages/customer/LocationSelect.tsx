import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LocateFixed, MapPin, Search } from 'lucide-react';
import { IZMIR_DISTRICTS, distanceKm } from '@/lib/geo';
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

  const choose = async (label: string, lat: number, lng: number) => {
    await setLocation({ label, lat, lng });
    toast(tx(`Konum ${label} olarak ayarlandı`, `Location set to ${label}`), 'success');
    // Opened directly (shared link, new tab): there is no in-app page to go back to.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/kesfet', { replace: true });
  };

  const useDevice = () => {
    setLocating(true);
    getDevicePosition({ highAccuracy: false, timeout: 10000 }).then(
      ({ latitude, longitude }) => {
        setLocating(false);
        const nearest = [...IZMIR_DISTRICTS].sort((a, b) => distanceKm(latitude, longitude, a.lat, a.lng) - distanceKm(latitude, longitude, b.lat, b.lng))[0];
        const km = distanceKm(latitude, longitude, nearest.lat, nearest.lng);
        // Only the matched district centre is kept, never the exact device fix,
        // so a precise home address is never stored on the account.
        if (km < 15) {
          choose(`${nearest.name} (${tx('Konumum', 'My location')})`, nearest.lat, nearest.lng);
        } else {
          toast(tx('Konumunuz İzmir servis alanının dışında görünüyor. Lütfen listeden bir semt seçin.', 'You seem to be outside the İzmir service area. Please choose an area from the list.'), 'error');
        }
      },
      (err) => {
        setLocating(false);
        toast(err === 'unsupported' ? tx('Tarayıcınız konum özelliğini desteklemiyor.', 'Your browser does not support location.') : tx('Konum izni alınamadı. Lütfen listeden bir semt seçin.', 'Location permission was not granted. Please choose an area from the list.'), 'error');
      },
    );
  };

  // Accent-insensitive, so "karsiyaka" also finds Karşıyaka.
  const list = IZMIR_DISTRICTS.filter((d) => fold(d.name).includes(fold(query)));

  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px] text-white">{tx('Konumunuzu seçin', 'Choose your location')}</h1>
      <p className="mt-2 text-sm text-mist">{tx('Size en yakın işletmeleri göstermek için konumunuzu seçin. Rango şu an İzmir’de hizmet veriyor.', 'Choose your location to see the businesses nearest to you. Rango currently serves İzmir.')}</p>

      <Button variant="outline" full size="lg" className="mt-8" loading={locating} icon={<LocateFixed className="h-4 w-4" />} onClick={useDevice}>
        {tx('Mevcut konumumu kullan', 'Use my current location')}
      </Button>
      <p className="mt-2 text-xs leading-relaxed text-mist-2">{tx('Konumunuz yalnızca size en yakın semti bulmak için cihazınızda kullanılır; tam konumunuz saklanmaz, yalnızca seçilen semt kaydedilir.', 'Your location is only used on your device to find the nearest area; your exact position is never stored, only the chosen area.')}</p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-2" />
        <input aria-label={tx('Semt ara', 'Search areas')} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx('Semt ara', 'Search areas')} className="h-12 w-full rounded-xl border border-line bg-coal pl-11 pr-4 text-sm text-white placeholder:text-mist-3 focus:border-gold-500/60 focus:outline-none" />
      </div>

      <div className="mt-4 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-coal">
        {list.map((d) => {
          const active = location.label === d.name;
          return (
            <button key={d.name} type="button" aria-current={active ? 'true' : undefined} onClick={() => choose(d.name, d.lat, d.lng)} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.03]">
              <MapPin className={`h-4 w-4 ${active ? 'text-gold-400' : 'text-mist-2'}`} />
              <span className="flex-1">
                <span className="block text-sm text-white">{d.name}</span>
                <span className="text-xs text-mist-2">İzmir</span>
              </span>
              {active && <Check className="h-4 w-4 text-gold-400" />}
            </button>
          );
        })}
        {!list.length && <p className="px-5 py-6 text-center text-sm text-mist-2">{tx('Bu isimde bir semt bulunamadı.', 'No area found with this name.')}</p>}
      </div>
    </div>
  );
}
