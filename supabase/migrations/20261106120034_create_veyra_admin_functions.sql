/*
# VEYRA administration functions

1. `claim_first_admin` - bootstrap: the signed-in user becomes administrator ONLY while no administrator exists.
2. `admin_set_business_status` - approve / reject / suspend businesses, set verified and featured flags; notifies owner.
3. `admin_set_user_suspended` - suspend or reactivate an account (admins cannot suspend themselves).
4. `admin_update_settings` - commission rate and booking rules.
5. `admin_resolve_refund` - approve (payment marked refunded) or reject a refund request; notifies customer.
6. `admin_set_review_hidden` - review moderation.
7. `admin_set_commission_status` - mark commission as invoiced / paid.
8. `admin_stats` - platform-wide totals and last 6 months series.

Security: every function checks is_admin() for the caller (except the one-time bootstrap) and is not callable by anonymous users.
*/

CREATE OR REPLACE FUNCTION claim_first_admin() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'VEYRA_AUTH_REQUIRED'; END IF;
  LOCK TABLE profiles IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM profiles WHERE role = 'admin') THEN RETURN false; END IF;
  UPDATE profiles SET role = 'admin' WHERE id = auth.uid();
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION claim_first_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION claim_first_admin() TO authenticated;

CREATE OR REPLACE FUNCTION admin_exists() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE role = 'admin');
$$;
REVOKE EXECUTE ON FUNCTION admin_exists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_exists() TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_business_status(p_business uuid, p_status text, p_verified boolean, p_featured boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_b businesses%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_status NOT IN ('pending','approved','rejected','suspended') THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  SELECT * INTO v_b FROM businesses WHERE id = p_business;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
  UPDATE businesses SET status = p_status, is_verified = coalesce(p_verified, is_verified), is_featured = coalesce(p_featured, is_featured)
  WHERE id = p_business;
  IF v_b.status <> p_status THEN
    PERFORM notify(v_b.owner_id, 'business_status',
      CASE p_status WHEN 'approved' THEN 'İşletmeniz onaylandı'
                    WHEN 'rejected' THEN 'İşletme başvurunuz reddedildi'
                    WHEN 'suspended' THEN 'İşletmeniz askıya alındı'
                    ELSE 'İşletmeniz incelemeye alındı' END,
      CASE p_status WHEN 'approved' THEN v_b.name || ' artık VEYRA''da yayında ve randevu alabilir.'
                    ELSE 'Detaylar için VEYRA destek ekibiyle iletişime geçebilirsiniz.' END,
      '/isletme');
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_set_business_status(uuid, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_business_status(uuid, text, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_user_suspended(p_user uuid, p_suspended boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_user = auth.uid() THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  UPDATE profiles SET is_suspended = coalesce(p_suspended, false) WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_set_user_suspended(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_user_suspended(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION admin_update_settings(p_commission_rate numeric, p_pending_minutes int, p_slot_interval int,
  p_min_lead int, p_max_days int, p_max_reschedules int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  UPDATE platform_settings SET commission_rate = p_commission_rate, pending_payment_minutes = p_pending_minutes,
    slot_interval_minutes = p_slot_interval, min_lead_minutes = p_min_lead, max_booking_days = p_max_days,
    max_reschedules = p_max_reschedules, updated_at = now()
  WHERE id = 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_update_settings(numeric, int, int, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_update_settings(numeric, int, int, int, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION admin_resolve_refund(p_request uuid, p_approve boolean, p_note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_r refund_requests%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  UPDATE refund_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    admin_note = left(nullif(trim(coalesce(p_note, '')), ''), 500), resolved_by = auth.uid(), resolved_at = now()
  WHERE id = p_request AND status = 'pending'
  RETURNING * INTO v_r;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'VEYRA_INVALID_STATE'; END IF;

  IF p_approve THEN
    UPDATE payments SET status = 'refunded', refunded_amount = v_r.amount, refunded_at = now() WHERE id = v_r.payment_id;
    PERFORM notify(v_r.customer_id, 'refund', 'Kapora iadeniz onaylandı',
      to_char(v_r.amount, 'FM999G999D00') || ' ₺ iadeniz kartınıza gönderildi. Bankanıza bağlı olarak hesabınıza yansıması birkaç gün sürebilir.', '/randevularim');
  ELSE
    UPDATE payments SET status = 'paid' WHERE id = v_r.payment_id;
    PERFORM notify(v_r.customer_id, 'refund', 'İade talebiniz sonuçlandı',
      'İade talebiniz onaylanmadı.' || coalesce(' Not: ' || v_r.admin_note, ''), '/randevularim');
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_resolve_refund(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_resolve_refund(uuid, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_review_hidden(p_review uuid, p_hidden boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  UPDATE reviews SET is_hidden = coalesce(p_hidden, false) WHERE id = p_review;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_set_review_hidden(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_review_hidden(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_commission_status(p_record uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  IF p_status NOT IN ('pending','invoiced','paid') THEN RAISE EXCEPTION 'VEYRA_INVALID_INPUT'; END IF;
  UPDATE commission_records SET status = p_status WHERE id = p_record;
  IF NOT FOUND THEN RAISE EXCEPTION 'VEYRA_NOT_FOUND'; END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_set_commission_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_commission_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION admin_stats() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'VEYRA_FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'customers', (SELECT count(*) FROM profiles WHERE role = 'customer'),
    'business_owners', (SELECT count(*) FROM profiles WHERE role = 'business'),
    'businesses', (SELECT count(*) FROM businesses),
    'businesses_pending', (SELECT count(*) FROM businesses WHERE status = 'pending'),
    'appointments', (SELECT count(*) FROM appointments WHERE status <> 'pending_payment'),
    'appointments_completed', (SELECT count(*) FROM appointments WHERE status = 'completed'),
    'appointments_upcoming', (SELECT count(*) FROM appointments WHERE status IN ('confirmed','pending_approval') AND starts_at > now()),
    'deposits_collected', (SELECT coalesce(sum(amount), 0) FROM payments WHERE status IN ('paid','refund_pending')),
    'refunded_total', (SELECT coalesce(sum(refunded_amount), 0) FROM payments WHERE status = 'refunded'),
    'commission_total', (SELECT coalesce(sum(commission_amount), 0) FROM commission_records),
    'commission_pending', (SELECT coalesce(sum(commission_amount), 0) FROM commission_records WHERE status <> 'paid'),
    'gross_volume', (SELECT coalesce(sum(total_amount), 0) FROM commission_records),
    'refunds_pending', (SELECT count(*) FROM refund_requests WHERE status = 'pending'),
    'monthly', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'), 'appointments', m.appts, 'commission', m.comm) ORDER BY m.month), '[]'::jsonb)
      FROM (
        SELECT gs.month,
          (SELECT count(*) FROM appointments a WHERE date_trunc('month', a.starts_at) = gs.month AND a.status IN ('confirmed','completed','pending_approval')) AS appts,
          (SELECT coalesce(sum(c.commission_amount), 0) FROM commission_records c WHERE date_trunc('month', c.created_at) = gs.month) AS comm
        FROM generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') AS gs(month)
      ) m
    )
  ) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION admin_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_stats() TO authenticated;
