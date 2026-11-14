/*
# VEYRA triggers

1. Automatic profile creation on sign-up. Account type comes from sign-up data but can only be
   'customer' or 'business' - the admin role can never be self-assigned.
2. updated_at maintenance.
3. Business cached values: minimum service price, average rating and review count (hidden reviews excluded).
4. Internal `notify` helper used by server functions (not callable by clients).
*/

CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type text := coalesce(NEW.raw_user_meta_data->>'account_type', 'customer');
  v_gender text := coalesce(NEW.raw_user_meta_data->>'gender', 'unspecified');
BEGIN
  IF v_type NOT IN ('customer','business') THEN v_type := 'customer'; END IF;
  IF v_gender NOT IN ('female','male','other','unspecified') THEN v_gender := 'unspecified'; END IF;
  INSERT INTO profiles (id, role, full_name, email, phone, gender)
  VALUES (
    NEW.id, v_type,
    left(coalesce(NEW.raw_user_meta_data->>'full_name', ''), 120),
    NEW.email,
    left(NEW.raw_user_meta_data->>'phone', 30),
    v_gender
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS businesses_updated_at ON businesses;
CREATE TRIGGER businesses_updated_at BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS appointments_updated_at ON appointments;
CREATE TRIGGER appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS payments_updated_at ON payments;
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION refresh_business_min_price() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business uuid := coalesce(NEW.business_id, OLD.business_id);
BEGIN
  UPDATE businesses SET min_price = coalesce(
    (SELECT min(s.price) FROM services s WHERE s.business_id = v_business AND s.is_active), 0)
  WHERE id = v_business;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION refresh_business_min_price() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS services_min_price ON services;
CREATE TRIGGER services_min_price AFTER INSERT OR UPDATE OR DELETE ON services
  FOR EACH ROW EXECUTE FUNCTION refresh_business_min_price();

CREATE OR REPLACE FUNCTION refresh_business_rating() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_business uuid := coalesce(NEW.business_id, OLD.business_id);
BEGIN
  UPDATE businesses SET
    rating_avg = coalesce((SELECT round(avg(r.rating)::numeric, 2) FROM reviews r WHERE r.business_id = v_business AND NOT r.is_hidden), 0),
    review_count = (SELECT count(*) FROM reviews r WHERE r.business_id = v_business AND NOT r.is_hidden)
  WHERE id = v_business;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION refresh_business_rating() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reviews_rating ON reviews;
CREATE TRIGGER reviews_rating AFTER INSERT OR UPDATE OR DELETE ON reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_business_rating();

CREATE OR REPLACE FUNCTION notify(p_user uuid, p_type text, p_title text, p_body text, p_link text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL THEN RETURN; END IF;
  INSERT INTO notifications (user_id, type, title, body, link) VALUES (p_user, p_type, p_title, p_body, p_link);
END;
$$;
REVOKE EXECUTE ON FUNCTION notify(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
