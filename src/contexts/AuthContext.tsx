import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

interface AuthValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
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

  useEffect(() => {
    let active = true;
    let requestId = 0;

    const apply = async (next: Session | null) => {
      const id = ++requestId;
      if (!next) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const result = await fetchProfile(next.user.id);
      if (!active || id !== requestId) return;
      if (result.missing) {
        // Stale session for an account that no longer exists.
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
      } else {
        setSession(next);
        setProfile(result.profile);
      }
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (next) setLoading(true);
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
    if (!session) return;
    const result = await fetchProfile(session.user.id);
    if (result.profile) setProfile(result.profile);
  }, [session]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
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
