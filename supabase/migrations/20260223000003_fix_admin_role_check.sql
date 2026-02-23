-- Phase 3A Security Fix: NEW-H1
-- Fix privilege escalation: admin role check must use app_metadata (server-only)
-- instead of raw_user_meta_data (client-writable)

-- Re-create generate_recurring_bookings with fixed admin check
CREATE OR REPLACE FUNCTION public.generate_recurring_bookings(days_ahead INTEGER DEFAULT 14)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec RECORD;
  current_date_iter DATE;
  target_date DATE;
  bookings_created INTEGER := 0;
  user_display_name TEXT;
BEGIN
  -- Security: Only allow admin users to call this function
  -- IMPORTANT: Uses raw_app_meta_data (server-only, NOT client-writable)
  -- Admin role must be set via Supabase Dashboard or service role API
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can generate recurring bookings';
  END IF;

  -- Security: Limit days_ahead to prevent abuse
  IF days_ahead > 90 THEN
    RAISE EXCEPTION 'Cannot generate bookings more than 90 days ahead';
  END IF;

  target_date := CURRENT_DATE + days_ahead;

  FOR rec IN
    SELECT rb.*, up.display_name
    FROM public.recurring_bookings rb
    JOIN public.user_profiles up ON rb.user_id = up.id
    WHERE rb.is_active = true
      AND rb.start_date <= target_date
      AND (rb.end_date IS NULL OR rb.end_date >= CURRENT_DATE)
  LOOP
    current_date_iter := GREATEST(
      COALESCE(rec.last_generated_date + 1, rec.start_date),
      CURRENT_DATE
    );

    WHILE current_date_iter <= target_date AND
          (rec.end_date IS NULL OR current_date_iter <= rec.end_date) LOOP
      IF EXTRACT(ISODOW FROM current_date_iter)::INTEGER = ANY(rec.days_of_week) THEN
        BEGIN
          INSERT INTO public.bookings (user_id, user_name, date, duration, vehicle_type, spot_number)
          VALUES (rec.user_id, rec.display_name, current_date_iter, rec.duration, rec.vehicle_type, rec.spot_number);
          bookings_created := bookings_created + 1;
        EXCEPTION WHEN unique_violation OR check_violation THEN
          NULL; -- Skip conflicts silently
        END;
      END IF;
      current_date_iter := current_date_iter + 1;
    END LOOP;

    UPDATE public.recurring_bookings
    SET last_generated_date = target_date
    WHERE id = rec.id;
  END LOOP;

  RETURN bookings_created;
END;
$$;

-- Re-create expire_waitlist_notifications with fixed admin check
CREATE OR REPLACE FUNCTION public.expire_waitlist_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Security: Only allow admin users to call this function
  -- IMPORTANT: Uses raw_app_meta_data (server-only, NOT client-writable)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can expire waitlist notifications';
  END IF;

  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'notified'
    AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'waiting'
    AND date < CURRENT_DATE;

  RETURN expired_count;
END;
$$;
