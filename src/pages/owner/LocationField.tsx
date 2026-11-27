import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Crosshair, ExternalLink, Link2, MapPin, Settings, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { isInIzmir, parseLocationInput, viewUrl, type Coords } from '@/lib/maps';
import { canOpenAppSettings, getDevicePosition, isIOS, isNative, openAppSettings, systemLinkClick } from '@/lib/platform';

interface Props {
  value: Coords | null;
  district: string;
  onChange: (value: Coords | null) => void;
}

/**
 * A device fix less precise than this (metres) is not saved as the shop pin. With "Kesin Konum" off (iOS)
 * or only approximate location allowed (Android), the phone reports a deliberately blurred position
 * kilometres away, which would send customers to the wrong place.
 */
const MAX_PIN_ACCURACY_M = 150;

const SHORT_LINK_MSG = 'Kısa linkler okunamıyor. Google Haritalar’da mağazanın üstüne basılı tutun, çıkan koordinatı (ör. 38.4375, 27.1435) kopyalayıp buraya yapıştırın.';

export function LocationField({ value, district, onChange }: Props) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  // iOS asks for location only once; after a refusal (or with "Kesin Konum" off) only Settings can change it.
  const [settingsHint, setSettingsHint] = useState(false);

  const accept = (c: Coords) => {
    if (!isInIzmir(c)) {
      setError('Bu konum İzmir dışında görünüyor. Mağazanın yerini tekrar kontrol edin.');
      return;
    }
    setError(null);
    setSettingsHint(false);
    setLink('');
    onChange(c);
  };

  const useMyLocation = () => {
    setLocating(true);
    setError(null);
    setSettingsHint(false);
    getDevicePosition({ highAccuracy: true, timeout: 15000 }).then(
      (pos) => {
        setLocating(false);
        if (!(pos.accuracy <= MAX_PIN_ACCURACY_M)) {
          const radius = Number.isFinite(pos.accuracy) ? ` (yaklaşık ${Math.round(pos.accuracy)} m sapma)` : '';
          setSettingsHint(true);
          setError(
            isIOS
              ? `Konum yalnızca yaklaşık alındı${radius}, mağaza pini olarak kaydedilmedi. Ayarlar > Rango > Konum’dan “Kesin Konum”u açıp tekrar deneyin ya da harita linki yapıştırın.`
              : isNative
                ? `Konum yalnızca yaklaşık alındı${radius}, mağaza pini olarak kaydedilmedi. Telefon ayarlarından Rango için “tam konum” izni verip tekrar deneyin ya da harita linki yapıştırın.`
                : `Konum yeterince kesin alınamadı${radius}, mağaza pini olarak kaydedilmedi. Telefonunuzdan mağazadayken tekrar deneyin ya da harita linki yapıştırın.`,
          );
          return;
        }
        accept({ latitude: Math.round(pos.latitude * 1e6) / 1e6, longitude: Math.round(pos.longitude * 1e6) / 1e6 });
      },
      (err) => {
        setLocating(false);
        setError(
          err === 'unsupported'
            ? 'Tarayıcınız konum özelliğini desteklemiyor. Harita linki ile ekleyebilirsiniz.'
            : err === 'denied'
              ? isIOS
                ? 'Konum izni kapalı. Ayarlar > Rango > Konum’dan “Uygulamayı Kullanırken” ve “Kesin Konum”u açın ya da harita linki yapıştırın.'
                : 'Konum izni verilmedi. Tarayıcı veya telefon ayarlarından izin verin ya da harita linki yapıştırın.'
              : err === 'off'
                ? isIOS
                  ? 'Telefonunuzun konum servisleri kapalı. Ayarlar > Gizlilik ve Güvenlik > Konum Servisleri’nden açıp tekrar deneyin ya da harita linki yapıştırın.'
                  : 'Telefonunuzun konum özelliği kapalı. Hızlı ayarlardan Konum’u açıp tekrar deneyin ya da harita linki yapıştırın.'
              : 'Konumunuz alınamadı. Biraz sonra tekrar deneyin ya da harita linki yapıştırın.',
        );
        if (err === 'denied') setSettingsHint(true);
      },
    );
  };

  const applyLink = () => {
    if (!link.trim()) return;
    const r = parseLocationInput(link);
    if (r.ok) accept(r.coords);
    else setError(r.reason === 'short' ? SHORT_LINK_MSG : 'Bu linkten konum okunamadı. Google Haritalar’daki tam linki ya da koordinatı yapıştırın.');
  };

  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 rounded-2xl border p-4 ${value ? 'border-success-500/30 bg-success-500/10' : 'border-line bg-ink/50'}`}>
        {value ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-300" /> : <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-mist-2" />}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">{value ? 'Mağaza konumu işaretlendi' : 'Tam konum henüz eklenmedi'}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-mist-2">
            {value
              ? `Müşteriler yol tarifini bu noktaya alacak (${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}).`
              : `Şimdilik ${district || 'ilçe'} merkezi ve açık adresiniz kullanılıyor. Müşterilerin kapınıza kadar gelmesi için konum ekleyin.`}
          </p>
          {value && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <a href={viewUrl(value)} target="_blank" onClick={systemLinkClick(viewUrl(value))} rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-400 hover:text-gold-300">
                Haritada kontrol et <ExternalLink className="h-3 w-3" />
              </a>
              <button type="button" onClick={() => onChange(null)} className="inline-flex items-center gap-1 text-xs text-mist-2 hover:text-error-300">
                <Trash2 className="h-3 w-3" /> Konumu kaldır
              </button>
            </div>
          )}
        </div>
      </div>

      <Button type="button" variant="outline" full loading={locating} onClick={useMyLocation} icon={<Crosshair className="h-4 w-4" />}>
        Şu an mağazadayım, konumumu kullan
      </Button>

      <div>
        <label htmlFor="maps-link" className="mb-2 block text-xs font-medium tracking-wide text-mist">
          ya da Google Haritalar linki / koordinat yapıştırın
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-3" />
            <input
              id="maps-link"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setError(null);
                setSettingsHint(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyLink();
                }
              }}
              placeholder="https://www.google.com/maps/place/..."
              className="h-11 w-full rounded-xl border border-line bg-ink/60 pl-10 pr-3 text-sm text-white placeholder:text-mist-3 focus:border-gold-500/60 focus:outline-none"
            />
          </div>
          <Button type="button" variant="dark" onClick={applyLink} disabled={!link.trim()}>
            Ekle
          </Button>
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 rounded-xl border border-warning-500/30 bg-warning-500/10 px-3 py-2.5 text-xs leading-relaxed text-warning-300" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
      {error && settingsHint && canOpenAppSettings && (
        <Button type="button" variant="ghost" full onClick={openAppSettings} icon={<Settings className="h-4 w-4" />}>
          Ayarlar’ı aç
        </Button>
      )}
    </div>
  );
}
