/*
# VEYRA core schema

Creates every table of the VEYRA booking marketplace together with privacy rules.

1. New Tables
- `profiles` - one per account: role (customer / business / admin), name, phone, gender, location, suspension flag, push token.
- `categories` - service categories (Kuaför, Berber, ...).
- `businesses` - business profile, location, deposit settings, cancellation policy, approval status, rating cache.
- `services` - services offered by a business with price and duration.
- `employees` - staff of a business.
- `employee_services` - which employee performs which service.
- `working_hours` - weekly opening hours and breaks per business (ISO weekday 1-7).
- `time_slots` - blocked time ranges (holidays, staff leave) per business or employee.
- `appointments` - bookings with price / deposit snapshot; overlap is prevented by an exclusion constraint.
- `payments` - deposit payment records (no card data, only last 4 digits and brand).
- `reviews` - one review per completed appointment.
- `favorites` - customer favorite businesses.
- `notifications` - in-app notifications.
- `commission_records` - platform commission per completed appointment.
- `refund_requests` - refund workflow records.
- `platform_settings` - single-row platform configuration (commission rate, payment mode, booking rules).

2. Security
- RLS enabled on all tables.
- Customers read only their own appointments, payments, favorites, notifications, refund requests.
- Business owners read and manage only their own business data and its appointments.
- Admins (role = admin) can read platform-wide data.
- Privileged columns (role, suspension, business status, verification, ratings) are not writable by clients;
  column-level grants restrict writes to user-editable columns. Appointments, payments, reviews,
  commission and refund records are written only by server functions.

3. Important notes
1. Double bookings are blocked by a GiST exclusion constraint on (employee, time range) for active statuses.
2. Pending-payment holds are released by the booking functions after the configured number of minutes.
*/

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','business','admin')),
  full_name text NOT NULL DEFAULT '' CHECK (char_length(full_name) <= 120),
  email text,
  phone text CHECK (phone IS NULL OR char_length(phone) <= 30),
  gender text NOT NULL DEFAULT 'unspecified' CHECK (gender IN ('female','male','other','unspecified')),
  city text NOT NULL DEFAULT 'İzmir',
  district text,
  latitude double precision,
  longitude double precision,
  avatar_url text,
  locale text NOT NULL DEFAULT 'tr' CHECK (locale IN ('tr','en')),
  push_token text,
  is_suspended boolean NOT NULL DEFAULT false,
  onboarding_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'sparkles',
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE SET NULL,
  category_id uuid NOT NULL REFERENCES categories(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  phone text,
  email text,
  address text NOT NULL DEFAULT '',
  district text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT 'İzmir',
  latitude double precision,
  longitude double precision,
  logo_url text,
  cover_url text,
  gallery text[] NOT NULL DEFAULT '{}',
  gender_focus text NOT NULL DEFAULT 'unisex' CHECK (gender_focus IN ('unisex','female','male')),
  deposit_type text NOT NULL DEFAULT 'percentage' CHECK (deposit_type IN ('percentage','fixed')),
  deposit_value numeric(10,2) NOT NULL DEFAULT 20 CHECK (deposit_value >= 0),
  cancellation_hours int NOT NULL DEFAULT 24 CHECK (cancellation_hours BETWEEN 0 AND 168),
  auto_confirm boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  is_verified boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  rating_avg numeric(3,2) NOT NULL DEFAULT 0,
  review_count int NOT NULL DEFAULT 0,
  booking_count int NOT NULL DEFAULT 0,
  min_price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_percentage_max CHECK (deposit_type <> 'percentage' OR deposit_value <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS businesses_one_per_owner ON businesses(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS businesses_category_idx ON businesses(category_id);
CREATE INDEX IF NOT EXISTS businesses_status_idx ON businesses(status);

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  price numeric(10,2) NOT NULL CHECK (price > 0 AND price <= 1000000),
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 5 AND 600),
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS services_business_idx ON services(business_id);

CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  title text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employees_business_idx ON employees(business_id);

CREATE TABLE IF NOT EXISTS employee_services (
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (employee_id, service_id)
);
CREATE INDEX IF NOT EXISTS employee_services_service_idx ON employee_services(service_id);

CREATE TABLE IF NOT EXISTS working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_closed boolean NOT NULL DEFAULT false,
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '19:00',
  break_start time,
  break_end time,
  UNIQUE (business_id, weekday),
  CONSTRAINT hours_order CHECK (close_time > open_time),
  CONSTRAINT break_order CHECK (break_start IS NULL OR break_end IS NULL OR break_end > break_start)
);

CREATE TABLE IF NOT EXISTS time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slot_order CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS time_slots_business_idx ON time_slots(business_id, starts_at);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_code text UNIQUE NOT NULL DEFAULT ('VY' || upper(substr(md5(random()::text), 1, 6))),
  customer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  business_id uuid NOT NULL REFERENCES businesses(id),
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  employee_id uuid NOT NULL REFERENCES employees(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','pending_approval','confirmed','completed','cancelled','rejected','no_show')),
  service_name text NOT NULL,
  employee_name text NOT NULL,
  duration_minutes int NOT NULL,
  total_price numeric(10,2) NOT NULL,
  deposit_amount numeric(10,2) NOT NULL,
  remaining_amount numeric(10,2) NOT NULL,
  customer_note text NOT NULL DEFAULT '' CHECK (char_length(customer_note) <= 500),
  cancelled_by text CHECK (cancelled_by IN ('customer','business','admin','system')),
  cancellation_reason text,
  cancelled_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  reschedule_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appt_order CHECK (ends_at > starts_at),
  CONSTRAINT no_double_booking EXCLUDE USING gist (
    employee_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('pending_payment','pending_approval','confirmed'))
);
CREATE INDEX IF NOT EXISTS appointments_customer_idx ON appointments(customer_id, starts_at);
CREATE INDEX IF NOT EXISTS appointments_business_idx ON appointments(business_id, starts_at);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  customer_id uuid NOT NULL REFERENCES profiles(id),
  business_id uuid NOT NULL REFERENCES businesses(id),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  payment_type text NOT NULL DEFAULT 'deposit' CHECK (payment_type IN ('deposit')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled','refund_pending','refunded')),
  provider text NOT NULL DEFAULT 'iyzico',
  provider_payment_id text,
  card_brand text,
  card_last4 text CHECK (card_last4 IS NULL OR card_last4 ~ '^[0-9]{4}$'),
  paid_at timestamptz,
  refunded_amount numeric(10,2) NOT NULL DEFAULT 0,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_appointment_idx ON payments(appointment_id);
CREATE INDEX IF NOT EXISTS payments_business_idx ON payments(business_id);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments(customer_id);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid UNIQUE NOT NULL REFERENCES appointments(id),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES profiles(id),
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '' CHECK (char_length(comment) <= 1000),
  reviewer_name text NOT NULL DEFAULT '',
  service_name text NOT NULL DEFAULT '',
  owner_reply text CHECK (owner_reply IS NULL OR char_length(owner_reply) <= 1000),
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_business_idx ON reviews(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, business_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS commission_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid UNIQUE NOT NULL REFERENCES appointments(id),
  business_id uuid NOT NULL REFERENCES businesses(id),
  total_amount numeric(10,2) NOT NULL,
  commission_rate numeric(5,2) NOT NULL,
  commission_amount numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','invoiced','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_business_idx ON commission_records(business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES appointments(id),
  payment_id uuid NOT NULL REFERENCES payments(id),
  customer_id uuid NOT NULL REFERENCES profiles(id),
  business_id uuid NOT NULL REFERENCES businesses(id),
  amount numeric(10,2) NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  resolved_by uuid REFERENCES profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS refund_one_open_per_payment ON refund_requests(payment_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS platform_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  commission_rate numeric(5,2) NOT NULL DEFAULT 10 CHECK (commission_rate BETWEEN 0 AND 50),
  payment_mode text NOT NULL DEFAULT 'test' CHECK (payment_mode IN ('test','live')),
  payment_provider text NOT NULL DEFAULT 'iyzico',
  pending_payment_minutes int NOT NULL DEFAULT 15 CHECK (pending_payment_minutes BETWEEN 5 AND 120),
  slot_interval_minutes int NOT NULL DEFAULT 30 CHECK (slot_interval_minutes IN (10,15,20,30,45,60)),
  min_lead_minutes int NOT NULL DEFAULT 60 CHECK (min_lead_minutes BETWEEN 0 AND 1440),
  max_booking_days int NOT NULL DEFAULT 60 CHECK (max_booking_days BETWEEN 1 AND 365),
  max_reschedules int NOT NULL DEFAULT 2 CHECK (max_reschedules BETWEEN 0 AND 10),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Helper functions
CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin' AND NOT is_suspended);
$$;

CREATE OR REPLACE FUNCTION owns_business(p_business uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM businesses WHERE id = p_business AND owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION has_role(p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = p_role AND NOT is_suspended);
$$;

CREATE OR REPLACE FUNCTION is_customer_of_my_business(p_customer uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM appointments a JOIN businesses b ON b.id = a.business_id
    WHERE a.customer_id = p_customer AND b.owner_id = auth.uid()
  );
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION owns_business(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION has_role(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_customer_of_my_business(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION owns_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION has_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION is_customer_of_my_business(uuid) TO authenticated;

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT ON profiles TO authenticated;
GRANT UPDATE (full_name, phone, gender, city, district, latitude, longitude, avatar_url, locale, push_token, onboarding_done) ON profiles TO authenticated;

GRANT SELECT ON categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON categories TO authenticated;

GRANT SELECT ON businesses TO anon, authenticated;
GRANT INSERT (category_id, name, slug, description, phone, email, address, district, city, latitude, longitude, logo_url, cover_url, gallery, gender_focus, deposit_type, deposit_value, cancellation_hours, auto_confirm) ON businesses TO authenticated;
GRANT UPDATE (category_id, name, description, phone, email, address, district, city, latitude, longitude, logo_url, cover_url, gallery, gender_focus, deposit_type, deposit_value, cancellation_hours, auto_confirm) ON businesses TO authenticated;

GRANT SELECT ON services, employees, employee_services, working_hours TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON services, employees, working_hours TO authenticated;
GRANT INSERT, DELETE ON employee_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON time_slots TO authenticated;

GRANT SELECT ON appointments, payments, commission_records, refund_requests TO authenticated;
GRANT SELECT ON reviews TO anon, authenticated;
GRANT SELECT, DELETE ON favorites TO authenticated;
GRANT INSERT (business_id) ON favorites TO authenticated;
GRANT SELECT, DELETE ON notifications TO authenticated;
GRANT UPDATE (is_read) ON notifications TO authenticated;
GRANT SELECT ON platform_settings TO anon, authenticated;

-- profiles policies
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR is_admin() OR is_customer_of_my_business(id));
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- categories policies
DROP POLICY IF EXISTS "categories_select" ON categories;
CREATE POLICY "categories_select" ON categories FOR SELECT TO anon, authenticated
  USING (is_active OR (auth.role() = 'authenticated' AND is_admin()));
DROP POLICY IF EXISTS "categories_insert_admin" ON categories;
CREATE POLICY "categories_insert_admin" ON categories FOR INSERT TO authenticated WITH CHECK (is_admin());
DROP POLICY IF EXISTS "categories_update_admin" ON categories;
CREATE POLICY "categories_update_admin" ON categories FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
DROP POLICY IF EXISTS "categories_delete_admin" ON categories;
CREATE POLICY "categories_delete_admin" ON categories FOR DELETE TO authenticated USING (is_admin());

-- businesses policies
DROP POLICY IF EXISTS "businesses_select_public" ON businesses;
CREATE POLICY "businesses_select_public" ON businesses FOR SELECT TO anon
  USING (status = 'approved');
DROP POLICY IF EXISTS "businesses_select_auth" ON businesses;
CREATE POLICY "businesses_select_auth" ON businesses FOR SELECT TO authenticated
  USING (status = 'approved' OR owner_id = auth.uid() OR is_admin());
DROP POLICY IF EXISTS "businesses_insert_owner" ON businesses;
CREATE POLICY "businesses_insert_owner" ON businesses FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND has_role('business'));
DROP POLICY IF EXISTS "businesses_update_owner" ON businesses;
CREATE POLICY "businesses_update_owner" ON businesses FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- services / employees / working_hours: public read for approved businesses, owner manages
DROP POLICY IF EXISTS "services_select" ON services;
CREATE POLICY "services_select" ON services FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = services.business_id AND b.status = 'approved')
         OR (auth.role() = 'authenticated' AND (owns_business(business_id) OR is_admin())));
DROP POLICY IF EXISTS "services_insert" ON services;
CREATE POLICY "services_insert" ON services FOR INSERT TO authenticated WITH CHECK (owns_business(business_id));
DROP POLICY IF EXISTS "services_update" ON services;
CREATE POLICY "services_update" ON services FOR UPDATE TO authenticated USING (owns_business(business_id)) WITH CHECK (owns_business(business_id));
DROP POLICY IF EXISTS "services_delete" ON services;
CREATE POLICY "services_delete" ON services FOR DELETE TO authenticated USING (owns_business(business_id));

DROP POLICY IF EXISTS "employees_select" ON employees;
CREATE POLICY "employees_select" ON employees FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM businesses b WHERE b.id = employees.business_id AND b.status = 'approved')
         OR (auth.role() = 'authenticated' AND (owns_business(business_id) OR is_admin())));
DROP POLICY IF EXISTS "employees_insert" ON employees;
CREATE POLICY "employees_insert" ON employees FOR INSERT TO authenticated WITH CHECK (owns_business(business_id));
DROP POLICY IF EXISTS "employees_update" ON employees;
CREATE POLICY "employees_update" ON employees FOR UPDATE TO authenticated USING (owns_business(business_id)) WITH CHECK (owns_business(business_id));
DROP POLICY IF EXISTS "employees_delete" ON employees;
CREATE POLICY "employees_delete" ON employees FOR DELETE TO authenticated USING (owns_business(business_id));

DROP POLICY IF EXISTS "employee_services_select" ON employee_services;
CREATE POLICY "employee_services_select" ON employee_services FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "employee_services_insert" ON employee_services;
CREATE POLICY "employee_services_insert" ON employee_services FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM employees e JOIN services s ON s.business_id = e.business_id
    WHERE e.id = employee_services.employee_id AND s.id = employee_services.service_id AND owns_business(e.business_id)
  ));
DROP POLICY IF EXISTS "employee_services_delete" ON employee_services;
CREATE POLICY "employee_services_delete" ON employee_services FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM employees e WHERE e.id = employee_services.employee_id AND owns_business(e.business_id)));

DROP POLICY IF EXISTS "working_hours_select" ON working_hours;
CREATE POLICY "working_hours_select" ON working_hours FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "working_hours_insert" ON working_hours;
CREATE POLICY "working_hours_insert" ON working_hours FOR INSERT TO authenticated WITH CHECK (owns_business(business_id));
DROP POLICY IF EXISTS "working_hours_update" ON working_hours;
CREATE POLICY "working_hours_update" ON working_hours FOR UPDATE TO authenticated USING (owns_business(business_id)) WITH CHECK (owns_business(business_id));
DROP POLICY IF EXISTS "working_hours_delete" ON working_hours;
CREATE POLICY "working_hours_delete" ON working_hours FOR DELETE TO authenticated USING (owns_business(business_id));

DROP POLICY IF EXISTS "time_slots_select" ON time_slots;
CREATE POLICY "time_slots_select" ON time_slots FOR SELECT TO authenticated USING (owns_business(business_id) OR is_admin());
DROP POLICY IF EXISTS "time_slots_insert" ON time_slots;
CREATE POLICY "time_slots_insert" ON time_slots FOR INSERT TO authenticated
  WITH CHECK (owns_business(business_id) AND (employee_id IS NULL OR EXISTS (SELECT 1 FROM employees e WHERE e.id = time_slots.employee_id AND e.business_id = time_slots.business_id)));
DROP POLICY IF EXISTS "time_slots_update" ON time_slots;
CREATE POLICY "time_slots_update" ON time_slots FOR UPDATE TO authenticated
  USING (owns_business(business_id))
  WITH CHECK (owns_business(business_id) AND (employee_id IS NULL OR EXISTS (SELECT 1 FROM employees e WHERE e.id = time_slots.employee_id AND e.business_id = time_slots.business_id)));
DROP POLICY IF EXISTS "time_slots_delete" ON time_slots;
CREATE POLICY "time_slots_delete" ON time_slots FOR DELETE TO authenticated USING (owns_business(business_id));

-- appointments / payments / commission / refunds: read-only for involved parties
DROP POLICY IF EXISTS "appointments_select" ON appointments;
CREATE POLICY "appointments_select" ON appointments FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR owns_business(business_id) OR is_admin());
DROP POLICY IF EXISTS "payments_select" ON payments;
CREATE POLICY "payments_select" ON payments FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR owns_business(business_id) OR is_admin());
DROP POLICY IF EXISTS "commission_select" ON commission_records;
CREATE POLICY "commission_select" ON commission_records FOR SELECT TO authenticated
  USING (owns_business(business_id) OR is_admin());
DROP POLICY IF EXISTS "refunds_select" ON refund_requests;
CREATE POLICY "refunds_select" ON refund_requests FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR owns_business(business_id) OR is_admin());

-- reviews
DROP POLICY IF EXISTS "reviews_select_public" ON reviews;
CREATE POLICY "reviews_select_public" ON reviews FOR SELECT TO anon USING (NOT is_hidden);
DROP POLICY IF EXISTS "reviews_select_auth" ON reviews;
CREATE POLICY "reviews_select_auth" ON reviews FOR SELECT TO authenticated
  USING (NOT is_hidden OR customer_id = auth.uid() OR owns_business(business_id) OR is_admin());

-- favorites
DROP POLICY IF EXISTS "favorites_select_own" ON favorites;
CREATE POLICY "favorites_select_own" ON favorites FOR SELECT TO authenticated USING (customer_id = auth.uid());
DROP POLICY IF EXISTS "favorites_insert_own" ON favorites;
CREATE POLICY "favorites_insert_own" ON favorites FOR INSERT TO authenticated WITH CHECK (customer_id = auth.uid());
DROP POLICY IF EXISTS "favorites_delete_own" ON favorites;
CREATE POLICY "favorites_delete_own" ON favorites FOR DELETE TO authenticated USING (customer_id = auth.uid());

-- notifications
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own" ON notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- platform settings: readable, changed only through admin function
DROP POLICY IF EXISTS "settings_select" ON platform_settings;
CREATE POLICY "settings_select" ON platform_settings FOR SELECT TO anon, authenticated USING (true);
