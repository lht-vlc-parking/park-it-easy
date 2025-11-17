-- Step 1: Add user_id column to bookings table
ALTER TABLE public.bookings 
ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Create index for performance
CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);

-- Step 3: Drop old permissive RLS policies
DROP POLICY IF EXISTS "Anyone can view bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anyone can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Anyone can delete bookings" ON public.bookings;

-- Step 4: Create secure RLS policies that restrict access to own bookings only
CREATE POLICY "Users can view their own bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own bookings"
ON public.bookings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Step 5: Create a public view for booking availability (aggregate data only, no personal info)
CREATE OR REPLACE VIEW public.booking_availability AS
SELECT 
  date,
  spot_number,
  duration,
  vehicle_type,
  COUNT(*) as booking_count
FROM public.bookings
GROUP BY date, spot_number, duration, vehicle_type;

-- Grant public access to the availability view
GRANT SELECT ON public.booking_availability TO anon, authenticated;