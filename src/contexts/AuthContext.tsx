import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** Re-reads the profile row. Resolves to false when it could not be loaded. */
  refreshProfile: () => Promise<boolean>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

type ProfileResult = { profile: Profile | null; missing: boolean };

async function fetchProfile(userId: string): Promise<ProfileResult> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    console.error('profile load failed', error);
    return { profile: null, missing: false };
  }
  return { profile: data as Profile | null, missing: !data };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // The user the provider is currently showing, and the newest session the
  // auth client reported for any user. Kept in refs so the auth callback can
  // tell a real account change from a token refresh without re-subscribing.
  const userIdRef = useRef<string | null>(null);
  const latestSessionRef = useRef<Session | null>(null);
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    let inFlight = false;

    const apply = async (next: Session | null) => {
      const id = ++requestId;
      if (!next) {
        inFlight = false;
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      inFlight = true;
      setLoading(true);
      const result = await fetchProfile(next.user.id);
      if (!active || id !== requestId) return;
      inFlight = false;
      if (result.missing) {
        // Stale session for an account that no longer exists.
        userIdRef.current = null;
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
      } else {
        // A token refresh may have arrived while the profile was loading.
        const latest = latestSessionRef.current;
        setSession(latest && latest.user.id === next.user.id ? latest : next);
        setProfile(result.profile);
      }
      setLoading(false);
    };

    // Same user, new session object (tab focus, hourly token refresh, e-mail or
    // password change). Re-read the profile quietly, never through `loading`,
    // so protected pages stay mounted and keep their unsaved state.
    const refreshQuietly = async (userId: string) => {
      const id = requestId;
      const result = await fetchProfile(userId);
      if (!active || id !== requestId || userIdRef.current !== userId) return;
      if (result.profile) setProfile(result.profile);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      latestSessionRef.current = next;
      const nextId = next?.user.id ?? null;
      if (nextId && nextId === userIdRef.current) {
        setSession(next);
        if (event === 'USER_UPDATED' || !profileRef.current) {
          // Deferred to avoid calling Supabase inside the auth callback (lock deadlock).
          // Skipped while the load for this user is still running; it reads the profile anyway.
          setTimeout(() => {
            if (active && !inFlight) void refreshQuietly(nextId);
          }, 0);
        }
        return;
      }
      // A different account (or the first one): drop the previous user's
      // profile so nothing renders with it while the new one loads.
      userIdRef.current = nextId;
      if (next) {
        setLoading(true);
        setProfile(null);
      }
      // Deferred to avoid calling Supabase inside the auth callback (lock deadlock).
      setTimeout(() => {
        if (active) void apply(next);
      }, 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return false;
    const result = await fetchProfile(session.user.id);
    if (result.profile) setProfile(result.profile);
    return !!result.profile;
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    userIdRef.current = null;
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function homePathFor(profile: Profile | null): string {
  if (profile?.role === 'admin') return '/yonetim';
  if (profile?.role === 'business') return '/isletme';
  return '/kesfet';
}
