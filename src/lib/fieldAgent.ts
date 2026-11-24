import { supabase } from '@/lib/supabase';
import type { BusinessStatus } from '@/lib/types';

/** The signed-in person's field-agent record, or null when they are not an active field agent. */
export interface FieldAgentMe {
  code: string;
  bonus_amount: number;
  since: string;
}

export type BonusStatus = 'pending' | 'paid' | 'cancelled';

export interface FieldAgentBusiness {
  id: string;
  name: string;
  slug: string;
  district: string;
  city: string;
  status: BusinessStatus;
  created_at: string;
  referred_at: string;
  phone: string | null;
  has_cover: boolean;
  has_address: boolean;
  has_description: boolean;
  booking_count: number;
  rating_avg: number;
  review_count: number;
  owner_name: string | null;
  owner_phone: string | null;
  owner_email: string | null;
  services: number;
  employees: number;
  open_days: number;
  completed_appointments: number;
  bonus: { amount: number; status: BonusStatus } | null;
}

export async function fetchFieldAgentMe(): Promise<FieldAgentMe | null> {
  const { data, error } = await supabase.rpc('field_agent_me');
  // Before the migration runs the function does not exist: treat everyone as "not an agent".
  if (error) return null;
  if (!data) return null;
  const d = data as FieldAgentMe;
  return { ...d, bonus_amount: Number(d.bonus_amount) };
}

export async function fetchFieldAgentBusinesses(): Promise<FieldAgentBusiness[]> {
  const { data, error } = await supabase.rpc('field_agent_businesses');
  if (error) throw error;
  return ((data ?? []) as FieldAgentBusiness[]).map((b) => ({
    ...b,
    services: Number(b.services),
    employees: Number(b.employees),
    open_days: Number(b.open_days),
    completed_appointments: Number(b.completed_appointments),
    booking_count: Number(b.booking_count),
    rating_avg: Number(b.rating_avg),
    bonus: b.bonus ? { amount: Number(b.bonus.amount), status: b.bonus.status } : null,
  }));
}

export async function fieldAgentSetBusinessStatus(businessId: string, status: 'approved' | 'rejected', reason = ''): Promise<void> {
  const { error } = await supabase.rpc('field_agent_set_business_status', { p_business: businessId, p_status: status, p_reason: reason });
  if (error) throw error;
}

/** What a business still lacks before customers can book it (mirrors the owner's setup checklist). */
export function setupGaps(b: FieldAgentBusiness): string[] {
  const gaps: string[] = [];
  if (!b.services) gaps.push('Hizmet');
  if (!b.employees) gaps.push('Çalışan');
  if (!b.open_days) gaps.push('Çalışma saatleri');
  if (!b.has_cover) gaps.push('Kapak görseli');
  if (!b.has_address) gaps.push('Açık adres');
  if (!b.has_description) gaps.push('Açıklama');
  return gaps;
}

// ---------------------------------------------------------------------------
// Referral code carried from the agent's link (?ref=CODE) to the business sign-up form
// ---------------------------------------------------------------------------
const REF_KEY = 'rango.referral';
const REF_TTL_MS = 30 * 24 * 3600 * 1000;
export const REFERRAL_CODE_PATTERN = /^[A-Z0-9]{6}$/;

export function normalizeReferralCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
}

/** Stores a ?ref= code from the current address so it survives sign-up and e-mail confirmation. */
export function captureReferralFromUrl(): void {
  if (typeof window === 'undefined') return;
  try {
    const code = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref') ?? '');
    if (REFERRAL_CODE_PATTERN.test(code)) localStorage.setItem(REF_KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    /* storage blocked: the owner can still type the code */
  }
}

export function storedReferralCode(): string {
  try {
    const raw = localStorage.getItem(REF_KEY);
    if (!raw) return '';
    const { code, at } = JSON.parse(raw) as { code?: string; at?: number };
    if (!code || !at || Date.now() - at > REF_TTL_MS) return '';
    return REFERRAL_CODE_PATTERN.test(code) ? code : '';
  } catch {
    return '';
  }
}

export function clearStoredReferralCode(): void {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* nothing to clear */
  }
}

export async function claimBusinessReferral(businessId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc('claim_business_referral', { p_business: businessId, p_code: code });
  if (error) throw error;
}

/** The link an agent shares with a salon: opens business sign-up with the agent's code. */
export function referralLink(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://rango.com.tr';
  return `${origin}/kayit?tip=isletme&ref=${code}`;
}
