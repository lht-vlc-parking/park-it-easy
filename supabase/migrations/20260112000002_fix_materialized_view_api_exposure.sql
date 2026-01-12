-- Migration: Fix materialized view API exposure
-- Issue: Materialized views don't support RLS, so exposing them via API is a security concern
-- Solution: Revoke direct access and provide a secure function wrapper

-- Revoke direct access to the materialized view from API roles
REVOKE SELECT ON public.booking_summary_mv FROM anon;
REVOKE SELECT ON public.booking_summary_mv FROM authenticated;

-- Create a secure function to access the booking summary
-- This function checks authentication and can apply additional security logic
CREATE OR REPLACE FUNCTION public.get_booking_summary()
RETURNS TABLE (
  total_bookings bigint,
  total_users bigint,
  upcoming_bookings bigint,
  today_bookings bigint,
  this_week_bookings bigint,
  this_month_bookings bigint,
  current_fairness_score numeric
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only authenticated users can access booking summary
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT 
    mv.total_bookings,
    mv.total_users,
    mv.upcoming_bookings,
    mv.today_bookings,
    mv.this_week_bookings,
    mv.this_month_bookings,
    mv.current_fairness_score
  FROM public.booking_summary_mv mv;
END;
$$;

-- Grant execute permission to authenticated users only
GRANT EXECUTE ON FUNCTION public.get_booking_summary() TO authenticated;
