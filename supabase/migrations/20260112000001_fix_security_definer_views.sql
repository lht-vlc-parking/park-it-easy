-- Migration: Fix SECURITY DEFINER views
-- Issue: Views defined with SECURITY DEFINER enforce permissions of the view creator
--        instead of the querying user, bypassing RLS policies
-- Solution: Recreate views with SECURITY INVOKER (or no security option, which defaults to INVOKER)

-- Fix 1: public.booking_fairness
DROP VIEW IF EXISTS public.booking_fairness CASCADE;
CREATE VIEW public.booking_fairness
WITH (security_invoker = true)
AS
WITH user_month_bookings AS (
  SELECT 
    user_id,
    COUNT(*) as booking_count
  FROM public.bookings
  WHERE date >= date_trunc('month', CURRENT_DATE)
    AND date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
  GROUP BY user_id
),
stats AS (
  SELECT 
    AVG(booking_count) as avg_bookings,
    STDDEV_POP(booking_count) as std_dev,
    COUNT(*) as user_count
  FROM user_month_bookings
)
SELECT 
  s.avg_bookings,
  s.std_dev,
  s.user_count,
  CASE 
    WHEN s.avg_bookings = 0 OR s.avg_bookings IS NULL THEN 100
    ELSE GREATEST(0, LEAST(100, 100 - (s.std_dev / s.avg_bookings * 100)))
  END as fairness_score
FROM stats s;

GRANT SELECT ON public.booking_fairness TO authenticated;

-- Fix 2: public.active_parking_spots
DROP VIEW IF EXISTS public.active_parking_spots CASCADE;
CREATE VIEW public.active_parking_spots
WITH (security_invoker = true)
AS
SELECT 
  ps.*,
  COALESCE(today_bookings.booking_count, 0) as today_booking_count,
  CASE 
    WHEN COALESCE(today_bookings.has_car, false) THEN 'car_booked'
    WHEN COALESCE(today_bookings.moto_count, 0) >= ps.max_motorcycles THEN 'motorcycles_full'
    WHEN COALESCE(today_bookings.booking_count, 0) > 0 THEN 'partial'
    ELSE 'available'
  END as availability_status
FROM public.parking_spots ps
LEFT JOIN (
  SELECT 
    spot_number,
    COUNT(*) as booking_count,
    COUNT(*) FILTER (WHERE vehicle_type = 'motorcycle') as moto_count,
    bool_or(vehicle_type = 'car' AND duration = 'full') as has_car
  FROM public.bookings
  WHERE date = CURRENT_DATE
  GROUP BY spot_number
) today_bookings ON ps.spot_number = today_bookings.spot_number
WHERE ps.is_active = true;

GRANT SELECT ON public.active_parking_spots TO authenticated;

-- Fix 3: public.daily_occupancy_stats
DROP VIEW IF EXISTS public.daily_occupancy_stats CASCADE;
CREATE VIEW public.daily_occupancy_stats
WITH (security_invoker = true)
AS
WITH date_series AS (
  SELECT generate_series(
    date_trunc('month', CURRENT_DATE)::date,
    (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date,
    '1 day'::interval
  )::date as date
),
weekday_dates AS (
  SELECT date 
  FROM date_series 
  WHERE EXTRACT(ISODOW FROM date) BETWEEN 1 AND 5
)
SELECT 
  wd.date,
  EXTRACT(ISODOW FROM wd.date)::integer as day_of_week,
  EXTRACT(DAY FROM wd.date)::integer as day_of_month,
  COALESCE(COUNT(b.id), 0) as booking_count,
  COALESCE(COUNT(b.id) FILTER (WHERE b.vehicle_type = 'car'), 0) as car_count,
  COALESCE(COUNT(b.id) FILTER (WHERE b.vehicle_type = 'motorcycle'), 0) as moto_count,
  2 as max_spots,
  ROUND(COALESCE(COUNT(b.id), 0)::numeric / 2 * 100, 1) as occupancy_percent
FROM weekday_dates wd
LEFT JOIN public.bookings b ON wd.date = b.date
GROUP BY wd.date
ORDER BY wd.date;

GRANT SELECT ON public.daily_occupancy_stats TO authenticated;

-- Fix 4: public.weekly_booking_trends
DROP VIEW IF EXISTS public.weekly_booking_trends CASCADE;
CREATE VIEW public.weekly_booking_trends
WITH (security_invoker = true)
AS
SELECT 
  date_trunc('week', date)::date as week_start,
  COUNT(*) as total_bookings,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE vehicle_type = 'car') as car_bookings,
  COUNT(*) FILTER (WHERE vehicle_type = 'motorcycle') as moto_bookings,
  ROUND(AVG(
    CASE spot_number
      WHEN 84 THEN 1
      WHEN 85 THEN 2
    END
  ), 2) as avg_spot_preference
FROM public.bookings
WHERE date >= CURRENT_DATE - INTERVAL '12 weeks'
GROUP BY date_trunc('week', date)
ORDER BY week_start DESC;

GRANT SELECT ON public.weekly_booking_trends TO authenticated;

-- Fix 5: public.user_booking_stats
DROP VIEW IF EXISTS public.user_booking_stats CASCADE;
CREATE VIEW public.user_booking_stats
WITH (security_invoker = true)
AS
SELECT 
  up.id as user_id,
  up.display_name,
  up.department,
  COUNT(b.id) as total_bookings,
  COUNT(b.id) FILTER (WHERE b.date >= date_trunc('week', CURRENT_DATE)) as this_week,
  COUNT(b.id) FILTER (WHERE b.date >= date_trunc('month', CURRENT_DATE)) as this_month,
  COUNT(b.id) FILTER (WHERE b.vehicle_type = 'car') as car_bookings,
  COUNT(b.id) FILTER (WHERE b.vehicle_type = 'motorcycle') as motorcycle_bookings,
  COUNT(b.id) FILTER (WHERE b.spot_number = 84) as spot_84_count,
  COUNT(b.id) FILTER (WHERE b.spot_number = 85) as spot_85_count,
  COUNT(b.id) FILTER (WHERE b.duration = 'full') as full_day_count,
  COUNT(b.id) FILTER (WHERE b.duration = 'morning') as morning_count,
  COUNT(b.id) FILTER (WHERE b.duration = 'afternoon') as afternoon_count,
  MIN(b.date) as first_booking_date,
  MAX(b.date) as last_booking_date
FROM public.user_profiles up
LEFT JOIN public.bookings b ON up.id = b.user_id
GROUP BY up.id, up.display_name, up.department;

GRANT SELECT ON public.user_booking_stats TO authenticated;

-- Fix 6: public.waitlist_with_users
DROP VIEW IF EXISTS public.waitlist_with_users CASCADE;
CREATE VIEW public.waitlist_with_users
WITH (security_invoker = true)
AS
SELECT 
  w.*,
  up.display_name,
  up.email
FROM public.booking_waitlist w
JOIN public.user_profiles up ON w.user_id = up.id
WHERE w.status = 'waiting'
ORDER BY w.date, w.spot_number, w.position;

GRANT SELECT ON public.waitlist_with_users TO authenticated;

-- Fix 7: public.spot_popularity
DROP VIEW IF EXISTS public.spot_popularity CASCADE;
CREATE VIEW public.spot_popularity
WITH (security_invoker = true)
AS
SELECT 
  spot_number,
  EXTRACT(ISODOW FROM date)::integer as day_of_week,
  COUNT(*) as booking_count,
  ROUND(COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY spot_number), 0) * 100, 1) as percentage
FROM public.bookings
WHERE date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY spot_number, EXTRACT(ISODOW FROM date)
ORDER BY spot_number, day_of_week;

GRANT SELECT ON public.spot_popularity TO authenticated;

-- Recreate the materialized view that depends on booking_fairness
DROP MATERIALIZED VIEW IF EXISTS public.booking_summary_mv;
CREATE MATERIALIZED VIEW public.booking_summary_mv AS
SELECT 
  COUNT(*) as total_bookings,
  COUNT(DISTINCT user_id) as total_users,
  COUNT(*) FILTER (WHERE date >= CURRENT_DATE) as upcoming_bookings,
  COUNT(*) FILTER (WHERE date = CURRENT_DATE) as today_bookings,
  COUNT(*) FILTER (WHERE date >= date_trunc('week', CURRENT_DATE)) as this_week_bookings,
  COUNT(*) FILTER (WHERE date >= date_trunc('month', CURRENT_DATE)) as this_month_bookings,
  (SELECT fairness_score FROM public.booking_fairness) as current_fairness_score
FROM public.bookings;

CREATE UNIQUE INDEX idx_booking_summary_mv ON public.booking_summary_mv ((1));
GRANT SELECT ON public.booking_summary_mv TO authenticated;
