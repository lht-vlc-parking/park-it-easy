-- Fix durations_overlap with proper search_path = public, pg_temp
-- This follows Supabase Security Advisor recommendations

-- Drop existing function
DROP FUNCTION IF EXISTS public.durations_overlap(public.booking_duration, public.booking_duration) CASCADE;

-- Recreate with SET search_path = public, pg_temp (recommended by Supabase)
CREATE OR REPLACE FUNCTION public.durations_overlap(d1 public.booking_duration, d2 public.booking_duration) 
RETURNS boolean 
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Full day overlaps with everything
  IF d1 = 'full'::public.booking_duration OR d2 = 'full'::public.booking_duration THEN
    RETURN true;
  END IF;
  -- Same duration overlaps
  IF d1 = d2 THEN
    RETURN true;
  END IF;
  -- Different specific durations don't overlap
  RETURN false;
END;
$$;

-- Recreate the trigger function with proper search_path
DROP TRIGGER IF EXISTS validate_booking_conflict ON public.bookings;
DROP FUNCTION IF EXISTS public.check_car_booking_conflict() CASCADE;

CREATE OR REPLACE FUNCTION public.check_car_booking_conflict()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  conflict_count integer;
BEGIN
  -- Only check for cars
  IF NEW.vehicle_type = 'car' THEN
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
  
  IF NEW.vehicle_type = 'motorcycle' THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'car'
      AND public.durations_overlap(duration, NEW.duration);
    
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'A car is booked for that time on this spot';
    END IF;
    
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
$$;

CREATE TRIGGER validate_booking_conflict
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_car_booking_conflict();
