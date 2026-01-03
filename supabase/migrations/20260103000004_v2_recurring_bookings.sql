-- V2 Migration: Recurring Bookings Table
-- Support for weekly recurring parking reservations

-- Create recurrence_pattern enum
CREATE TYPE recurrence_pattern AS ENUM ('daily', 'weekly', 'biweekly', 'monthly');

-- Create recurring_bookings table
CREATE TABLE public.recurring_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spot_number INTEGER NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  duration booking_duration NOT NULL,
  pattern recurrence_pattern NOT NULL DEFAULT 'weekly',
  days_of_week INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 1=Mon, 5=Fri
  start_date DATE NOT NULL,
  end_date DATE, -- NULL means indefinite
  is_active BOOLEAN DEFAULT true,
  last_generated_date DATE, -- Track which bookings have been generated
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Constraints
  CONSTRAINT valid_days_of_week CHECK (
    days_of_week <@ ARRAY[1,2,3,4,5,6,7] AND 
    array_length(days_of_week, 1) > 0
  ),
  CONSTRAINT valid_date_range CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Add comment for documentation
COMMENT ON TABLE public.recurring_bookings IS 'Recurring booking patterns for automatic reservation generation';

-- Enable RLS
ALTER TABLE public.recurring_bookings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own recurring bookings"
  ON public.recurring_bookings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own recurring bookings"
  ON public.recurring_bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recurring bookings"
  ON public.recurring_bookings
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recurring bookings"
  ON public.recurring_bookings
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_recurring_bookings_user_id ON public.recurring_bookings(user_id);
CREATE INDEX idx_recurring_bookings_active ON public.recurring_bookings(is_active) WHERE is_active = true;
CREATE INDEX idx_recurring_bookings_spot ON public.recurring_bookings(spot_number);

-- Trigger for updated_at
CREATE TRIGGER update_recurring_bookings_updated_at
  BEFORE UPDATE ON public.recurring_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate bookings from recurring patterns
-- This should be called by a cron job or edge function
CREATE OR REPLACE FUNCTION public.generate_recurring_bookings(days_ahead INTEGER DEFAULT 14)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec RECORD;
  current_date_iter DATE;
  target_date DATE;
  bookings_created INTEGER := 0;
  user_display_name TEXT;
BEGIN
  target_date := CURRENT_DATE + days_ahead;
  
  FOR rec IN 
    SELECT rb.*, up.display_name
    FROM public.recurring_bookings rb
    JOIN public.user_profiles up ON rb.user_id = up.id
    WHERE rb.is_active = true
      AND rb.start_date <= target_date
      AND (rb.end_date IS NULL OR rb.end_date >= CURRENT_DATE)
  LOOP
    -- Start from either last generated date + 1 or start_date, whichever is later
    current_date_iter := GREATEST(
      COALESCE(rec.last_generated_date + 1, rec.start_date),
      CURRENT_DATE
    );
    
    WHILE current_date_iter <= target_date AND 
          (rec.end_date IS NULL OR current_date_iter <= rec.end_date) LOOP
      
      -- Check if this day of week matches the pattern
      IF EXTRACT(ISODOW FROM current_date_iter)::INTEGER = ANY(rec.days_of_week) THEN
        -- Try to insert the booking (will fail if conflict due to existing constraints)
        BEGIN
          INSERT INTO public.bookings (user_id, user_name, date, duration, vehicle_type, spot_number)
          VALUES (rec.user_id, rec.display_name, current_date_iter, rec.duration, rec.vehicle_type, rec.spot_number);
          
          bookings_created := bookings_created + 1;
        EXCEPTION WHEN unique_violation OR check_violation THEN
          -- Booking already exists or violates constraints, skip
          NULL;
        END;
      END IF;
      
      current_date_iter := current_date_iter + 1;
    END LOOP;
    
    -- Update last_generated_date
    UPDATE public.recurring_bookings 
    SET last_generated_date = target_date
    WHERE id = rec.id;
  END LOOP;
  
  RETURN bookings_created;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.generate_recurring_bookings(INTEGER) TO authenticated;
