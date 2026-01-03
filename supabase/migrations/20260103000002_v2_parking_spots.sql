-- V2 Migration: Parking Spots Table
-- Make parking spots configurable instead of hardcoded

-- Create spot_type enum
CREATE TYPE spot_type AS ENUM ('standard', 'handicap', 'ev', 'motorcycle_only');

-- Create parking_spots table
CREATE TABLE public.parking_spots (
  id SERIAL PRIMARY KEY,
  spot_number INTEGER UNIQUE NOT NULL,
  spot_type spot_type DEFAULT 'standard',
  floor TEXT DEFAULT 'B1',
  section TEXT,
  max_motorcycles INTEGER DEFAULT 4 CHECK (max_motorcycles >= 0 AND max_motorcycles <= 10),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.parking_spots IS 'Configurable parking spots for the office';

-- Enable RLS
ALTER TABLE public.parking_spots ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Everyone can read, only admins can modify (for now, everyone can read)
CREATE POLICY "Anyone can view parking spots"
  ON public.parking_spots
  FOR SELECT
  TO authenticated
  USING (true);

-- Create indexes
CREATE INDEX idx_parking_spots_active ON public.parking_spots(is_active) WHERE is_active = true;
CREATE INDEX idx_parking_spots_type ON public.parking_spots(spot_type);

-- Trigger for updated_at
CREATE TRIGGER update_parking_spots_updated_at
  BEFORE UPDATE ON public.parking_spots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert current spots (84 and 85)
INSERT INTO public.parking_spots (spot_number, spot_type, floor, section, max_motorcycles, is_active)
VALUES 
  (84, 'standard', 'B1', 'A', 4, true),
  (85, 'standard', 'B1', 'A', 4, true);

-- Create a view for active spots with availability info
CREATE OR REPLACE VIEW public.active_parking_spots AS
SELECT 
  ps.*,
  COALESCE(today_bookings.booking_count, 0) as today_booking_count,
  CASE 
    WHEN COALESCE(today_bookings.has_car, false) THEN 'car_booked'
    WHEN COALESCE(today_bookings.moto_count, 0) >= ps.max_motorcycles THEN 'motorcycles_full'
    WHEN COALESCE(today_bookings.booking_count, 0) > 0 THEN 'partial'
    ELSE 'available'
  END as availability_status
FROM public.parking_spots ps
LEFT JOIN (
  SELECT 
    spot_number,
    COUNT(*) as booking_count,
    COUNT(*) FILTER (WHERE vehicle_type = 'motorcycle') as moto_count,
    bool_or(vehicle_type = 'car' AND duration = 'full') as has_car
  FROM public.bookings
  WHERE date = CURRENT_DATE
  GROUP BY spot_number
) today_bookings ON ps.spot_number = today_bookings.spot_number
WHERE ps.is_active = true;

-- Grant access to the view
GRANT SELECT ON public.active_parking_spots TO authenticated;
