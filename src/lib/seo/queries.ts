/**
 * Uygulamanın ve derleme eklentisinin Supabase'den AYNI sütunları okumasını sağlayan sorgu
 * metinleri. Statik sayfaya gömülen veri (bkz. `src/lib/prerenderData.ts`) uygulamanın kendi
 * sorgusunun sonucuyla aynı biçimde olmalıdır; bu yüzden ikisi de buradaki metni kullanır.
 *
 * Yalnızca ziyaretçiye açık sütunlar: işletmenin telefonu ve e-postası burada YOKTUR
 * (müşteriler Rango üzerinden randevu alır; bkz. `PUBLIC_BUSINESS_COLUMNS`, src/lib/api.ts).
 */
export const PUBLIC_BUSINESS_FIELDS =
  'id, owner_id, category_id, name, slug, description, address, district, city, latitude, longitude, logo_url, cover_url, gallery, gender_focus, deposit_type, deposit_value, cancellation_hours, auto_confirm, status, is_verified, is_featured, rating_avg, review_count, booking_count, min_price, created_at, categories(name, slug, icon)';

/** A city's approved businesses with what a listing page shows: services (for prices) and working hours. */
export const LISTING_SELECT = `${PUBLIC_BUSINESS_FIELDS}, services(name, description, price, duration_minutes, is_active, sort_order), working_hours(weekday, is_closed, open_time, close_time)`;

/** Public review columns; `customer_id` is deliberately left out (see src/lib/api.ts). */
export const PUBLIC_REVIEW_FIELDS = 'id, appointment_id, business_id, employee_id, rating, comment, reviewer_name, service_name, owner_reply, is_hidden, created_at';

/** Above this many businesses a page no longer embeds the whole city listing; the app fetches it instead. */
export const MAX_EMBEDDED_LISTING = 300;
