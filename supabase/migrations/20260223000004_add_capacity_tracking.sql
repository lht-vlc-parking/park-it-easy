-- Add capacity field to bookings table for multi-vehicle support
-- Capacity represents units occupied: 1 for motorcycle, 3 for car
-- Each parking spot has a size of 4 units

-- Add capacity column with computed value based on vehicle_type
ALTER TABLE public.bookings 
ADD COLUMN capacity INTEGER NOT NULL DEFAULT 1 CHECK (capacity IN (1, 3));

-- Set capacity based on vehicle_type
UPDATE public.bookings 
SET capacity = CASE 
  WHEN vehicle_type = 'car' THEN 3
  ELSE 1
END;

-- Create an updated trigger function that validates capacity constraints
-- Rule: At any given time on a spot, total capacity cannot exceed 4 units
DROP TRIGGER IF EXISTS validate_booking_conflict ON public.bookings;
DROP FUNCTION IF EXISTS public.check_car_booking_conflict() CASCADE;
DROP FUNCTION IF EXISTS public.durations_overlap(public.booking_duration, public.booking_duration) CASCADE;

-- Recreate duration overlap function
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

-- Create improved trigger function that validates both conflicts and capacity
CREATE OR REPLACE FUNCTION public.check_booking_capacity()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  conflict_count integer;
  total_capacity integer;
BEGIN
  -- Validate car conflicts (cars cannot overlap with other cars)
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

  -- Validate motorcycle conflicts with cars
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
  END IF;

  -- Validate total capacity doesn't exceed 4 units
  SELECT COALESCE(SUM(capacity), 0) INTO total_capacity
  FROM public.bookings
  WHERE spot_number = NEW.spot_number
    AND date = NEW.date
    AND public.durations_overlap(duration, NEW.duration)
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  
  IF total_capacity + NEW.capacity > 4 THEN
    RAISE EXCEPTION 'Not enough capacity. Available: % units, Required: % units', (4 - total_capacity), NEW.capacity;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_booking_capacity
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_booking_capacity();
