import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { IZMIR_CENTER } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface UserLocation {
  label: string;
  lat: number;
  lng: number;
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
    if (typeof parsed?.lat === 'number' && typeof parsed?.lng === 'number' && typeof parsed?.label === 'string') return parsed;
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const stored = readStored();
  const [location, setLoc] = useState<UserLocation>(stored ?? { label: IZMIR_CENTER.name, lat: IZMIR_CENTER.lat, lng: IZMIR_CENTER.lng });
  const [hasChosen, setHasChosen] = useState(!!stored);

  useEffect(() => {
    if (!stored && profile?.latitude != null && profile.longitude != null) {
      setLoc({ label: profile.district ?? 'İzmir', lat: profile.latitude, lng: profile.longitude });
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
