import { supabase, MEDIA_BUCKET } from '@/lib/supabase';
import type { Business, Category, Employee, PlatformSettings, Review, Service, Slot, WorkingHours } from '@/lib/types';

export const BUSINESS_LIST_COLUMNS =
  'id, owner_id, category_id, name, slug, description, address, district, city, latitude, longitude, logo_url, cover_url, gallery, gender_focus, deposit_type, deposit_value, cancellation_hours, auto_confirm, status, is_verified, is_featured, rating_avg, review_count, booking_count, min_price, created_at, phone, email, categories(name, slug, icon)';

const CATEGORY_TTL_MS = 5 * 60 * 1000;
let activeCategoriesCache: { at: number; data: Category[] } | null = null;

export async function fetchCategories(includeInactive = false): Promise<Category[]> {
  if (!includeInactive && activeCategoriesCache && Date.now() - activeCategoriesCache.at < CATEGORY_TTL_MS) {
    return activeCategoriesCache.data;
  }
  let q = supabase.from('categories').select('*').order('sort_order');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  const list = (data ?? []) as Category[];
  if (!includeInactive) activeCategoriesCache = { at: Date.now(), data: list };
  return list;
}

export type DiscoverySort = 'mesafe' | 'populer' | 'puan' | 'fiyat';

export interface DiscoveryQuery {
  lat?: number | null;
  lng?: number | null;
  category?: string | null;
  query?: string | null;
  maxPrice?: number | null;
  minRating?: number | null;
  gender?: string | null;
  availableToday?: boolean;
  featured?: boolean;
  sort?: DiscoverySort;
  limit?: number;
  offset?: number;
}

export interface DiscoveryPage {
  rows: { business: Business; distance: number | null }[];
  total: number;
}

export async function searchBusinesses(q: DiscoveryQuery): Promise<DiscoveryPage> {
  const { data, error } = await supabase.rpc('search_businesses', {
    p_lat: q.lat ?? null,
    p_lng: q.lng ?? null,
    p_category: q.category || null,
    p_query: q.query?.trim() || null,
    p_max_price: q.maxPrice || null,
    p_min_rating: q.minRating || null,
    p_gender: q.gender || null,
    p_available_today: !!q.availableToday,
    p_featured: !!q.featured,
    p_sort: q.sort ?? 'mesafe',
    p_limit: q.limit ?? 24,
    p_offset: q.offset ?? 0,
  });
  if (error) throw error;
  const list = (Array.isArray(data) ? data : []) as { business: Business; distance_km: number | null; total_count: number }[];
  return {
    rows: list.map((r) => ({ business: r.business, distance: r.distance_km })),
    total: list.length ? Number(list[0].total_count) : 0,
  };
}

export interface CategoryStat {
  category_id: string;
  business_count: number;
  min_price: number | null;
}

export async function fetchCategoryStats(): Promise<CategoryStat[]> {
  const { data, error } = await supabase.rpc('category_stats');
  if (error) throw error;
  return ((Array.isArray(data) ? data : []) as CategoryStat[]).map((s) => ({
    ...s,
    business_count: Number(s.business_count),
    min_price: s.min_price == null ? null : Number(s.min_price),
  }));
}

export async function fetchWorkingHoursFor(businessIds: string[]): Promise<WorkingHours[]> {
  if (!businessIds.length) return [];
  const { data, error } = await supabase.from('working_hours').select('*').in('business_id', businessIds);
  if (error) throw error;
  return (data ?? []) as WorkingHours[];
}

export interface BusinessDetail {
  business: Business;
  services: Service[];
  employees: Employee[];
  hours: WorkingHours[];
}

export async function fetchBusinessDetail(slug: string): Promise<BusinessDetail | null> {
  const { data: business, error } = await supabase.from('businesses').select(BUSINESS_LIST_COLUMNS).eq('slug', slug).maybeSingle();
  if (error) throw error;
  if (!business) return null;
  const b = business as unknown as Business;
  const [services, employees, hours] = await Promise.all([
    supabase.from('services').select('*').eq('business_id', b.id).eq('is_active', true).order('sort_order'),
    supabase.from('employees').select('*, employee_services(service_id)').eq('business_id', b.id).eq('is_active', true).order('sort_order'),
    supabase.from('working_hours').select('*').eq('business_id', b.id).order('weekday'),
  ]);
  if (services.error) throw services.error;
  if (employees.error) throw employees.error;
  if (hours.error) throw hours.error;
  return {
    business: b,
    services: (services.data ?? []) as Service[],
    employees: (employees.data ?? []) as Employee[],
    hours: (hours.data ?? []) as WorkingHours[],
  };
}

export async function fetchBusinessReviews(businessId: string, limit = 20): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Review[];
}

export async function fetchSlots(serviceId: string, employeeId: string | null, date: string, excludeAppointment?: string): Promise<Slot[]> {
  const { data, error } = await supabase.rpc('get_available_slots', {
    p_service: serviceId,
    p_employee: employeeId,
    p_date: date,
    p_exclude: excludeAppointment ?? null,
  });
  if (error) throw error;
  return (data ?? []) as Slot[];
}

export async function fetchSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase.from('platform_settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('settings missing');
  return data as PlatformSettings;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type UploadCheck = 'ok' | 'type' | 'size';

export function checkImage(file: File): UploadCheck {
  if (!ALLOWED_TYPES.includes(file.type)) return 'type';
  if (file.size > 5 * 1024 * 1024) return 'size';
  return 'ok';
}

export async function uploadBusinessImage(businessId: string, file: File, kind: 'logo' | 'cover' | 'gallery' | 'staff'): Promise<string> {
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${businessId}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}
