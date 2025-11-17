-- Create enum types for booking fields
CREATE TYPE booking_duration AS ENUM ('morning', 'afternoon', 'full');
CREATE TYPE vehicle_type AS ENUM ('car', 'motorcycle');

-- Create bookings table
CREATE TABLE public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name TEXT NOT NULL,
  date DATE NOT NULL,
  duration booking_duration NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  spot_number INTEGER NOT NULL CHECK (spot_number IN (84, 85)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow everyone to read bookings (public view)
CREATE POLICY "Anyone can view bookings"
  ON public.bookings
  FOR SELECT
  USING (true);

-- Create policy to allow everyone to insert bookings (public booking)
CREATE POLICY "Anyone can create bookings"
  ON public.bookings
  FOR INSERT
  WITH CHECK (true);

-- Create policy to allow everyone to delete bookings (unbook feature)
CREATE POLICY "Anyone can delete bookings"
  ON public.bookings
  FOR DELETE
  USING (true);

-- Create index for faster queries by date and spot
CREATE INDEX idx_bookings_date_spot ON public.bookings(date, spot_number);
CREATE INDEX idx_bookings_date ON public.bookings(date);