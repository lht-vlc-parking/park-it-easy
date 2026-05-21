-- Two bookings conflict only when they overlap by MORE than 1 minute.
-- This allows back-to-back bookings (e.g. 08:00–15:00 and 15:00–22:00)
-- and guards against false positives caused by TIME values stored with
-- seconds (e.g. '15:00:00') being compared against minute-precision input.

CREATE OR REPLACE FUNCTION public.times_overlap(
  s1 TIME, e1 TIME,
  s2 TIME, e2 TIME
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT LEAST(e1, e2) - GREATEST(s1, s2) >= INTERVAL '1 minute';
$$;
