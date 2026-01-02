-- Fix Supabase Security Issues
-- 1. Fix view SECURITY DEFINER issue
-- 2. Fix mutable search_path on functions

-- ============================================
-- FIX 1: Recreate booking_availability view with explicit SECURITY INVOKER
-- ============================================
DROP VIEW IF EXISTS public.booking_availability;

CREATE VIEW public.booking_availability 
WITH (security_invoker = true) AS
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

-- ============================================
-- FIX 2: Recreate durations_overlap function with immutable search_path
-- ============================================
DROP FUNCTION IF EXISTS durations_overlap(booking_duration, booking_duration);

CREATE OR REPLACE FUNCTION public.durations_overlap(d1 booking_duration, d2 booking_duration) 
RETURNS boolean AS $$
BEGIN
  -- Full day overlaps with everything
  IF d1 = 'full' OR d2 = 'full' THEN
    RETURN true;
  END IF;
  -- Same duration overlaps
  IF d1 = d2 THEN
    RETURN true;
  END IF;
  -- Different specific durations don't overlap
  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE
SET search_path = public;

-- ============================================
-- FIX 3: Recreate check_car_booking_conflict function with immutable search_path
-- ============================================

-- First drop the trigger that depends on this function
DROP TRIGGER IF EXISTS validate_booking_conflict ON public.bookings;

-- Drop the function
DROP FUNCTION IF EXISTS check_car_booking_conflict();

-- Recreate with fixed search_path
CREATE OR REPLACE FUNCTION public.check_car_booking_conflict()
RETURNS TRIGGER AS $$
DECLARE
  conflict_count integer;
BEGIN
  -- Only check for cars
  IF NEW.vehicle_type = 'car' THEN
    -- Count existing car bookings for the same spot and date with overlapping duration
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'car'
      AND public.durations_overlap(duration, NEW.duration)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'This spot already has a car booking at that time';
    END IF;
  END IF;
  
  -- For motorcycles, check car conflicts and motorcycle limit
  IF NEW.vehicle_type = 'motorcycle' THEN
    -- Check for car conflicts
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'car'
      AND public.durations_overlap(duration, NEW.duration);
    
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'A car is booked for that time on this spot';
    END IF;
    
    -- Check motorcycle limit (max 4)
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'motorcycle'
      AND public.durations_overlap(duration, NEW.duration)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    IF conflict_count >= 4 THEN
      RAISE EXCEPTION 'Maximum 4 motorcycles allowed at the same time';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = public;

-- Recreate the trigger
CREATE TRIGGER validate_booking_conflict
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_car_booking_conflict();
