-- Add start_time / end_time to bookings so conflict checks use real time intervals
-- instead of the coarse enum-based durations_overlap() function.
-- The duration enum is kept as a "preset label" column.

-- 1. Add nullable columns first so we can backfill
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time   TIME;

ALTER TABLE public.recurring_bookings
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time   TIME;

-- 2. Temporarily drop the future-date constraint so the backfill can update past bookings.
--    (PostgreSQL re-evaluates ALL check constraints on every updated row, even when the
--    checked column hasn't changed.)
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_future_date;

-- 3. Backfill existing rows using the agreed default schedule:
--    morning   08:00 – 15:00
--    afternoon 15:00 – 22:00
--    full      08:00 – 18:00
UPDATE public.bookings SET
  start_time = CASE duration
    WHEN 'morning'   THEN '08:00'::TIME
    WHEN 'afternoon' THEN '15:00'::TIME
    ELSE                  '08:00'::TIME  -- 'full'
  END,
  end_time = CASE duration
    WHEN 'morning'   THEN '15:00'::TIME
    WHEN 'afternoon' THEN '22:00'::TIME
    ELSE                  '18:00'::TIME  -- 'full'
  END
WHERE start_time IS NULL;

UPDATE public.recurring_bookings SET
  start_time = CASE duration
    WHEN 'morning'   THEN '08:00'::TIME
    WHEN 'afternoon' THEN '15:00'::TIME
    ELSE                  '08:00'::TIME
  END,
  end_time = CASE duration
    WHEN 'morning'   THEN '15:00'::TIME
    WHEN 'afternoon' THEN '22:00'::TIME
    ELSE                  '18:00'::TIME
  END
WHERE start_time IS NULL;

-- 4. Restore the future-date constraint (NOT VALID = enforced only on new/updated rows
--    going forward, not retroactively on the past bookings we just backfilled).
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_future_date CHECK (date >= CURRENT_DATE) NOT VALID;

-- 5. Now enforce NOT NULL and add a sanity check
ALTER TABLE public.bookings
  ALTER COLUMN start_time SET NOT NULL,
  ALTER COLUMN end_time   SET NOT NULL,
  ADD CONSTRAINT bookings_time_range_valid CHECK (end_time > start_time);

ALTER TABLE public.recurring_bookings
  ALTER COLUMN start_time SET NOT NULL,
  ALTER COLUMN end_time   SET NOT NULL,
  ADD CONSTRAINT recurring_bookings_time_range_valid CHECK (end_time > start_time);

-- 6. Replace durations_overlap with a proper time-interval overlap function.
--    Two intervals [s1, e1) and [s2, e2) overlap iff s1 < e2 AND s2 < e1.
--    Strictly less-than so back-to-back slots (e.g. 08:00–15:00 and 15:00–22:00)
--    are NOT considered overlapping.
CREATE OR REPLACE FUNCTION public.times_overlap(
  s1 TIME, e1 TIME,
  s2 TIME, e2 TIME
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT s1 < e2 AND s2 < e1;
$$;

-- 7. Update the capacity trigger to use times_overlap on the new columns
CREATE OR REPLACE FUNCTION public.check_booking_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  conflict_count integer;
  total_capacity integer;
BEGIN
  -- Cars cannot share the spot with another car in an overlapping time window
  IF NEW.vehicle_type = 'car' THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date        = NEW.date
      AND vehicle_type = 'car'
      AND public.times_overlap(start_time, end_time, NEW.start_time, NEW.end_time)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'This spot already has a car booking at that time';
    END IF;
  END IF;

  -- Total capacity for the overlapping time window must not exceed 4 units
  SELECT COALESCE(SUM(capacity), 0) INTO total_capacity
  FROM public.bookings
  WHERE spot_number = NEW.spot_number
    AND date        = NEW.date
    AND public.times_overlap(start_time, end_time, NEW.start_time, NEW.end_time)
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF total_capacity + NEW.capacity > 4 THEN
    RAISE EXCEPTION 'Not enough capacity. Available: % units, Required: % units',
      (4 - total_capacity), NEW.capacity;
  END IF;

  RETURN NEW;
END;
$$;
