import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_CITY_NAME, cityByName, cityOrDefault } from '@/lib/cities';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface UserLocation {
  label: string;
  /** City name from src/lib/cities.ts. Choices saved before cities existed are İzmir. */
  city: string;
  lat: number;
  lng: number;
}

function defaultLocation(): UserLocation {
  const city = cityOrDefault(DEFAULT_CITY_NAME);
  return { label: city.center.name, city: city.name, lat: city.center.lat, lng: city.center.lng };
}

interface LocationValue {
  location: UserLocation;
  hasChosen: boolean;
  setLocation: (loc: UserLocation) => Promise<void>;
}

const STORAGE_KEY = 'veyra.location';
const LocationContext = createContext<LocationValue | null>(null);

function readStored(): UserLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number' && typeof parsed?.label === 'string') {
      return { label: parsed.label, lat: parsed.lat, lng: parsed.lng, city: cityByName(parsed.city)?.name ?? DEFAULT_CITY_NAME };
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const stored = readStored();
  const [location, setLoc] = useState<UserLocation>(stored ?? defaultLocation());
  const [hasChosen, setHasChosen] = useState(!!stored);

  useEffect(() => {
    if (!stored && profile?.latitude != null && profile.longitude != null) {
      const city = cityOrDefault(profile.city).name;
      setLoc({ label: profile.district ?? city, city, lat: profile.latitude, lng: profile.longitude });
      setHasChosen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const setLocation = useCallback(
    async (loc: UserLocation) => {
      setLoc(loc);
      setHasChosen(true);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
      } catch {
        /* storage blocked or full: the choice still applies for this visit */
      }
      if (profile) {
        const { error } = await supabase
          .from('profiles')
          .update({
            city: loc.city,
            district: loc.label,
            // Saved at roughly 1 km resolution so an exact home address is never stored.
            latitude: Math.round(loc.lat * 100) / 100,
            longitude: Math.round(loc.lng * 100) / 100,
          })
          .eq('id', profile.id);
        if (error) console.error('location save failed', error);
      }
    },
    [profile],
  );

  return <LocationContext.Provider value={{ location, hasChosen, setLocation }}>{children}</LocationContext.Provider>;
}

export function useUserLocation(): LocationValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useUserLocation must be used inside LocationProvider');
  return ctx;
}
