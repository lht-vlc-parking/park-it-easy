-- Fix: Remove any existing triggers and recreate everything in the correct order
-- This ensures no orphaned triggers are trying to call non-existent functions

-- Step 1: Drop ALL existing triggers on bookings table
DROP TRIGGER IF EXISTS validate_booking_conflict ON bookings;
DROP TRIGGER IF EXISTS check_booking_conflict ON bookings;
DROP TRIGGER IF EXISTS booking_conflict_check ON bookings;

-- Step 2: Drop old functions if they exist
DROP FUNCTION IF EXISTS check_car_booking_conflict();
DROP FUNCTION IF EXISTS durations_overlap(text, text);

-- Step 3: Create the duration overlap function
-- Note: duration column is type 'booking_duration' (enum), not 'text'
CREATE OR REPLACE FUNCTION durations_overlap(d1 booking_duration, d2 booking_duration) 
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

-- Step 4: Create the validation function
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
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    
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

-- Step 5: Create the trigger
CREATE TRIGGER validate_booking_conflict
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION check_car_booking_conflict();
