-- Fix: Allow motorcycles to book when a car is present, rely on capacity validation instead
-- The capacity check (4 units max) handles all conflicts automatically

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

  -- Validate total capacity doesn't exceed 4 units
  -- This applies to both cars and motorcycles
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
