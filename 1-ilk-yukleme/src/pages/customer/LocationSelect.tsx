import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, LocateFixed, MapPin, Search } from 'lucide-react';
import { IZMIR_DISTRICTS, distanceKm } from '@/lib/geo';
import { useUserLocation } from '@/contexts/LocationContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/Button';

export default function LocationSelect() {
  const { location, setLocation } = useUserLocation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);

  const choose = async (label: string, lat: number, lng: number) => {
    await setLocation({ label, lat, lng });
    toast(`Konum ${label} olarak ayarlandı`, 'success');
    // Opened directly (shared link, new tab): there is no in-app page to go back to.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/kesfet', { replace: true });
  };

  const useDevice = () => {
    if (!('geolocation' in navigator)) {
      toast('Tarayıcınız konum özelliğini desteklemiyor.', 'error');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        const nearest = [...IZMIR_DISTRICTS].sort((a, b) => distanceKm(latitude, longitude, a.lat, a.lng) - distanceKm(latitude, longitude, b.lat, b.lng))[0];
        const km = distanceKm(latitude, longitude, nearest.lat, nearest.lng);
        // Only the matched district centre is kept, never the exact device fix,
        // so a precise home address is never stored on the account.
        if (km < 15) {
          choose(`${nearest.name} (Konumum)`, nearest.lat, nearest.lng);
        } else {
          toast('Konumunuz İzmir servis alanının dışında görünüyor. Lütfen listeden bir semt seçin.', 'error');
        }
      },
      () => {
        setLocating(false);
        toast('Konum izni alınamadı. Lütfen listeden bir semt seçin.', 'error');
      },
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  const list = IZMIR_DISTRICTS.filter((d) => d.name.toLocaleLowerCase('tr-TR').includes(query.toLocaleLowerCase('tr-TR')));

  return (
    <div className="mx-auto max-w-xl animate-fade-up">
      <p className="eyebrow mb-2">Konum</p>
      <h1 className="font-display text-4xl text-white">Neredesiniz?</h1>
      <p className="mt-2 text-sm text-mist">Size en yakın işletmeleri göstermek için konumunuzu seçin. Rango şu an İzmir’de hizmet veriyor.</p>

      <Button variant="outline" full size="lg" className="mt-8" loading={locating} icon={<LocateFixed className="h-4 w-4" />} onClick={useDevice}>
        Mevcut konumumu kullan
      </Button>
      <p className="mt-2 text-xs leading-relaxed text-mist-2">Konumunuz yalnızca size en yakın semti bulmak için cihazınızda kullanılır; tam konumunuz saklanmaz, yalnızca seçilen semt kaydedilir.</p>

      <div className="relative mt-6">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-2" />
        <input aria-label="Semt ara" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Semt ara" className="h-12 w-full rounded-xl border border-line bg-coal pl-11 pr-4 text-sm text-white placeholder:text-mist-3 focus:border-gold-500/60 focus:outline-none" />
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
        {!list.length && <p className="px-5 py-6 text-center text-sm text-mist-2">Bu isimde bir semt bulunamadı.</p>}
      </div>
    </div>
  );
}
