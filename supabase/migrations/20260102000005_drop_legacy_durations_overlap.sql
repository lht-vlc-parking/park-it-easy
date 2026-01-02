-- Drop the legacy text-based durations_overlap function
-- This function was created without search_path and is no longer needed
-- The correct version using booking_duration type already exists

DROP FUNCTION IF EXISTS public.durations_overlap(text, text);
