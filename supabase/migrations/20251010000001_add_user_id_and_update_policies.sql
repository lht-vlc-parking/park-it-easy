-- Simplified bookings table migration
-- This migration adds user_id for better tracking but keeps the table simple

-- Add user_id column if it doesn't exist
ALTER TABLE public.bookings 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for user_id for faster queries
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);

-- Update RLS policies to be more specific
-- Drop old policies (including new policy names for idempotency)
DROP POLICY IF EXISTS "Anyone can view bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anyone can delete bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated users can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can delete their own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;

-- Create new policies
-- Allow authenticated users to view all bookings
CREATE POLICY "Authenticated users can view all bookings"
  ON public.bookings
  FOR SELECT
  TO authenticated
  USING (true);

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
