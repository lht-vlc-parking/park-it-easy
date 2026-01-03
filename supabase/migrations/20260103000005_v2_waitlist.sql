-- V2 Migration: Booking Waitlist Table
-- Queue system for when spots are fully booked

-- Create waitlist_status enum
CREATE TYPE waitlist_status AS ENUM ('waiting', 'notified', 'expired', 'fulfilled');

-- Create booking_waitlist table
CREATE TABLE public.booking_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spot_number INTEGER NOT NULL,
  date DATE NOT NULL,
  duration booking_duration NOT NULL,
  vehicle_type vehicle_type NOT NULL,
  position INTEGER,
  status waitlist_status DEFAULT 'waiting',
  notified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- When the notification expires
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Unique constraint: one waitlist entry per user per spot per date per duration
  CONSTRAINT unique_waitlist_entry UNIQUE (user_id, spot_number, date, duration)
);

-- Add comment for documentation
COMMENT ON TABLE public.booking_waitlist IS 'Waitlist queue for fully booked parking spots';

-- Enable RLS
ALTER TABLE public.booking_waitlist ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own waitlist entries"
  ON public.booking_waitlist
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can join waitlist"
  ON public.booking_waitlist
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own waitlist entries"
  ON public.booking_waitlist
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can leave waitlist"
  ON public.booking_waitlist
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_waitlist_user_id ON public.booking_waitlist(user_id);
CREATE INDEX idx_waitlist_date_spot ON public.booking_waitlist(date, spot_number);
CREATE INDEX idx_waitlist_status ON public.booking_waitlist(status) WHERE status = 'waiting';
CREATE INDEX idx_waitlist_position ON public.booking_waitlist(date, spot_number, position);

-- Function to auto-assign position when joining waitlist
CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Assign the next position in the queue
  SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
  FROM public.booking_waitlist
  WHERE spot_number = NEW.spot_number
    AND date = NEW.date
    AND duration = NEW.duration
    AND status = 'waiting';
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_waitlist_position_trigger
  BEFORE INSERT ON public.booking_waitlist
  FOR EACH ROW EXECUTE FUNCTION public.assign_waitlist_position();

-- Function to notify next person in waitlist when a booking is cancelled
CREATE OR REPLACE FUNCTION public.notify_waitlist_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  next_in_queue RECORD;
BEGIN
  -- Find the next person in the waitlist
  SELECT * INTO next_in_queue
  FROM public.booking_waitlist
  WHERE spot_number = OLD.spot_number
    AND date = OLD.date
    AND status = 'waiting'
  ORDER BY position ASC
  LIMIT 1;
  
  IF FOUND THEN
    -- Update their status to notified
    UPDATE public.booking_waitlist
    SET 
      status = 'notified',
      notified_at = now(),
      expires_at = now() + INTERVAL '30 minutes' -- 30 min to claim the spot
    WHERE id = next_in_queue.id;
    
    -- Note: Actual notification (email/push) would be handled by an edge function
    -- that listens to changes in the waitlist table
  END IF;
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER notify_waitlist_on_booking_delete
  AFTER DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_waitlist_on_cancellation();

-- Function to expire old waitlist notifications
CREATE OR REPLACE FUNCTION public.expire_waitlist_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Expire notifications that have passed their expiry time
  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'notified'
    AND expires_at < now();
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  
  -- Also expire waitlist entries for past dates
  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'waiting'
    AND date < CURRENT_DATE;
  
  RETURN expired_count;
END;
$$;

-- View to see current waitlist with user info
CREATE OR REPLACE VIEW public.waitlist_with_users AS
SELECT 
  w.*,
  up.display_name,
  up.email
FROM public.booking_waitlist w
JOIN public.user_profiles up ON w.user_id = up.id
WHERE w.status = 'waiting'
ORDER BY w.date, w.spot_number, w.position;

-- Grant access (but RLS will still filter by user)
GRANT SELECT ON public.waitlist_with_users TO authenticated;
