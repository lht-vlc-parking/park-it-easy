-- Fix the security definer view warning by recreating it as a regular view
DROP VIEW IF EXISTS public.booking_availability;

-- Create view without SECURITY DEFINER (views are SECURITY INVOKER by default)
CREATE VIEW public.booking_availability AS
SELECT 
  date,
  spot_number,
  duration,
  vehicle_type,
  COUNT(*) as booking_count
FROM public.bookings
GROUP BY date, spot_number, duration, vehicle_type;

-- Grant public access to the availability view
GRANT SELECT ON public.booking_availability TO anon, authenticated;