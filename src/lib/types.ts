export type Role = 'customer' | 'business' | 'admin';
export type Gender = 'female' | 'male' | 'other' | 'unspecified';
export type GenderFocus = 'unisex' | 'female' | 'male';
export type BusinessStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type AppointmentStatus =
  | 'pending_payment'
  | 'pending_approval'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'rejected'
  | 'no_show';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refund_pending' | 'refunded';
export type RefundStatus = 'pending' | 'approved' | 'rejected';
export type CommissionStatus = 'pending' | 'invoiced' | 'paid';
export type PayoutAccountStatus = 'pending' | 'verified' | 'rejected';

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: Gender;
  city: string;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  avatar_url: string | null;
  locale: 'tr' | 'en';
  is_suspended: boolean;
  onboarding_done: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface Business {
  id: string;
  owner_id: string | null;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  phone: string | null;
  email: string | null;
  address: string;
  district: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  logo_url: string | null;
  cover_url: string | null;
  gallery: string[];
  gender_focus: GenderFocus;
  deposit_type: 'percentage' | 'fixed';
  deposit_value: number;
  cancellation_hours: number;
  auto_confirm: boolean;
  status: BusinessStatus;
  is_verified: boolean;
  is_featured: boolean;
  rating_avg: number;
  review_count: number;
  booking_count: number;
  min_price: number;
  created_at: string;
  categories?: Pick<Category, 'name' | 'slug' | 'icon'> | null;
}

export interface Service {
  id: string;
  business_id: string;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  sort_order: number;
}

export interface Employee {
  id: string;
  business_id: string;
  full_name: string;
  title: string;
  bio: string;
  avatar_url: string | null;
  is_active: boolean;
  sort_order: number;
  employee_services?: { service_id: string }[];
}

export interface WorkingHours {
  id: string;
  business_id: string;
  weekday: number;
  is_closed: boolean;
  open_time: string;
  close_time: string;
  break_start: string | null;
  break_end: string | null;
}

export interface BlockedSlot {
  id: string;
  business_id: string;
  employee_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
}

export interface Appointment {
  id: string;
  booking_code: string;
  customer_id: string;
  business_id: string;
  service_id: string | null;
  employee_id: string;
  starts_at: string;
  ends_at: string;
  status: AppointmentStatus;
  service_name: string;
  employee_name: string;
  duration_minutes: number;
  total_price: number;
  deposit_amount: number;
  remaining_amount: number;
  customer_note: string;
  cancelled_by: 'customer' | 'business' | 'admin' | 'system' | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  reschedule_count: number;
  /**
   * Cancellation window snapshotted at booking time by the security-hardening migration.
   * Undefined before that migration runs (and null on rows it could not backfill), so callers
   * fall back to businesses.cancellation_hours.
   */
  cancellation_hours?: number | null;
  created_at: string;
  businesses?: Pick<Business, 'id' | 'name' | 'slug' | 'cover_url' | 'address' | 'district' | 'city' | 'latitude' | 'longitude' | 'cancellation_hours'> & Partial<Pick<Business, 'owner_id' | 'phone'>> | null;
  profiles?: Pick<Profile, 'full_name' | 'phone' | 'email' | 'gender'> | null;
  payments?: Pick<Payment, 'id' | 'status' | 'amount' | 'card_last4' | 'provider_payment_id'>[];
  reviews?: { id: string }[];
}

export interface Payment {
  id: string;
  appointment_id: string;
  customer_id: string;
  business_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  provider_payment_id: string | null;
  card_brand: string | null;
  card_last4: string | null;
  paid_at: string | null;
  refunded_amount: number;
  refunded_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  appointment_id: string;
  business_id: string;
  /** Not selected by the public review list (src/lib/api.ts fetchBusinessReviews). */
  customer_id?: string;
  employee_id?: string | null;
  rating: number;
  comment: string;
  reviewer_name: string;
  service_name: string;
  owner_reply: string | null;
  is_hidden: boolean;
  created_at: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface CommissionRecord {
  id: string;
  appointment_id: string;
  business_id: string;
  total_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: CommissionStatus;
  created_at: string;
}

export interface PayoutAccount {
  business_id: string;
  iban: string;
  account_holder: string;
  bank_name: string;
  status: PayoutAccountStatus;
  rejection_reason: string | null;
  verified_at: string | null;
  updated_at: string;
}

export interface RefundRequest {
  id: string;
  appointment_id: string;
  payment_id: string;
  customer_id: string;
  business_id: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface PlatformSettings {
  id: number;
  commission_rate: number;
  payment_mode: 'test' | 'live';
  payment_provider: string;
  pending_payment_minutes: number;
  slot_interval_minutes: number;
  min_lead_minutes: number;
  max_booking_days: number;
  max_reschedules: number;
}

export interface Slot {
  slot_start: string;
  slot_employee_id: string;
}
