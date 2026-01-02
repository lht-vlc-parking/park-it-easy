-- Fix Remaining Security and Performance Issues
-- 1. Fix durations_overlap function search_path (recreate with SECURITY INVOKER)
-- 2. Optimize RLS policies to avoid re-evaluating auth.uid() per row

-- ============================================
-- FIX 1: Recreate durations_overlap with proper security settings
-- ============================================
DROP FUNCTION IF EXISTS public.durations_overlap(booking_duration, booking_duration);

CREATE FUNCTION public.durations_overlap(d1 booking_duration, d2 booking_duration) 
RETURNS boolean 
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;

-- ============================================
-- FIX 2: Optimize RLS policies for bookings table
-- Use subqueries to cache auth.uid() evaluation
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can delete their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;

-- Recreate policies with optimized auth.uid() usage
-- SELECT policy - no auth check needed, just verify authenticated
CREATE POLICY "Authenticated users can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT policy - use subquery to cache auth.uid()
CREATE POLICY "Authenticated users can create bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
  );

-- DELETE policy - use subquery to cache auth.uid()
CREATE POLICY "Users can delete their own bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
  );

-- UPDATE policy - use subquery to cache auth.uid()
CREATE POLICY "Users can update their own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
  );

-- ============================================
-- FIX 3: Update check_car_booking_conflict to use empty search_path
-- ============================================
DROP TRIGGER IF EXISTS validate_booking_conflict ON public.bookings;
DROP FUNCTION IF EXISTS public.check_car_booking_conflict();

CREATE FUNCTION public.check_car_booking_conflict()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
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
$$;

-- Recreate the trigger
CREATE TRIGGER validate_booking_conflict
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.check_car_booking_conflict();
