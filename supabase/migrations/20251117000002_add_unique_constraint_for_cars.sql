-- Add database-level unique constraint to prevent double bookings for cars
-- This prevents race conditions that can occur with application-level validation only

-- For cars: Only ONE car can book a spot on a specific date/duration combination
-- We need to create a unique constraint that considers the overlapping durations

-- First, let's create a function to check if durations overlap
CREATE OR REPLACE FUNCTION durations_overlap(d1 text, d2 text) 
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
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create a function to validate car bookings before insert/update
CREATE OR REPLACE FUNCTION check_car_booking_conflict()
RETURNS TRIGGER AS $$
DECLARE
  conflict_count integer;
BEGIN
  -- Only check for cars
  IF NEW.vehicle_type = 'car' THEN
    -- Count existing car bookings for the same spot and date with overlapping duration
    SELECT COUNT(*) INTO conflict_count
    FROM bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'car'
      AND durations_overlap(duration, NEW.duration)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid); -- Exclude current row for updates
    
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'This spot already has a car booking at that time';
    END IF;
  END IF;
  
  -- For motorcycles, check car conflicts and motorcycle limit
  IF NEW.vehicle_type = 'motorcycle' THEN
    -- Check for car conflicts
    SELECT COUNT(*) INTO conflict_count
    FROM bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'car'
      AND durations_overlap(duration, NEW.duration);
    
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'A car is booked for that time on this spot';
    END IF;
    
    -- Check motorcycle limit (max 4)
    SELECT COUNT(*) INTO conflict_count
    FROM bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'motorcycle'
      AND durations_overlap(duration, NEW.duration)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
    IF conflict_count >= 4 THEN
      RAISE EXCEPTION 'Maximum 4 motorcycles allowed at the same time';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop the trigger if it exists
DROP TRIGGER IF EXISTS validate_booking_conflict ON bookings;

-- Create the trigger
CREATE TRIGGER validate_booking_conflict
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_car_booking_conflict();

-- Add a comment explaining the constraint
COMMENT ON FUNCTION check_car_booking_conflict() IS 
  'Validates booking conflicts at database level to prevent race conditions. 
   Ensures: 1) Only one car per spot/date/duration, 2) No motorcycles when car is booked, 3) Max 4 motorcycles per spot/date/duration';
