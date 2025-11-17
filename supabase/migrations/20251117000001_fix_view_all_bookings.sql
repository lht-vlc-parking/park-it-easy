-- Fix RLS policies to allow all authenticated users to view ALL bookings
-- This ensures team-wide visibility as designed in the UI

-- Drop all existing policies on bookings table
DROP POLICY IF EXISTS "Anyone can view bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anyone can delete bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can view their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can create their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can delete their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON public.bookings;

-- Create new policies with correct permissions
-- CRITICAL: Allow authenticated users to view ALL bookings (team-wide visibility)
CREATE POLICY "Authenticated users can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (true);  -- This allows viewing ALL rows, not just user's own bookings

-- Allow authenticated users to create their own bookings
CREATE POLICY "Authenticated users can create bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete only their own bookings
CREATE POLICY "Users can delete their own bookings"
  ON public.bookings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Allow users to update only their own bookings
CREATE POLICY "Users can update their own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
