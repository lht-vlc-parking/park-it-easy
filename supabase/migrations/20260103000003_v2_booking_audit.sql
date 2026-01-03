-- V2 Migration: Booking Audit Table
-- Track all booking changes for history and analytics

-- Create audit_action enum
CREATE TYPE audit_action AS ENUM ('created', 'cancelled', 'modified');

-- Create booking_audit table
CREATE TABLE public.booking_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID,  -- Can be NULL if booking was deleted
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action audit_action NOT NULL,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add comment for documentation
COMMENT ON TABLE public.booking_audit IS 'Audit trail for all booking operations';

-- Enable RLS
ALTER TABLE public.booking_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can view their own audit history
CREATE POLICY "Users can view own audit history"
  ON public.booking_audit
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for common queries
CREATE INDEX idx_booking_audit_booking_id ON public.booking_audit(booking_id);
CREATE INDEX idx_booking_audit_user_id ON public.booking_audit(user_id);
CREATE INDEX idx_booking_audit_created_at ON public.booking_audit(created_at DESC);
CREATE INDEX idx_booking_audit_action ON public.booking_audit(action);

-- Function to log booking creation
CREATE OR REPLACE FUNCTION public.log_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.booking_audit (booking_id, user_id, action, new_data)
  VALUES (
    NEW.id,
    NEW.user_id,
    'created',
    jsonb_build_object(
      'date', NEW.date,
      'duration', NEW.duration,
      'vehicle_type', NEW.vehicle_type,
      'spot_number', NEW.spot_number,
      'user_name', NEW.user_name
    )
  );
  RETURN NEW;
END;
$$;

-- Function to log booking cancellation
CREATE OR REPLACE FUNCTION public.log_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.booking_audit (booking_id, user_id, action, old_data)
  VALUES (
    OLD.id,
    OLD.user_id,
    'cancelled',
    jsonb_build_object(
      'date', OLD.date,
      'duration', OLD.duration,
      'vehicle_type', OLD.vehicle_type,
      'spot_number', OLD.spot_number,
      'user_name', OLD.user_name
    )
  );
  RETURN OLD;
END;
$$;

-- Function to log booking modification
CREATE OR REPLACE FUNCTION public.log_booking_modified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only log if something actually changed
  IF OLD.date != NEW.date OR OLD.duration != NEW.duration OR 
     OLD.vehicle_type != NEW.vehicle_type OR OLD.spot_number != NEW.spot_number THEN
    INSERT INTO public.booking_audit (booking_id, user_id, action, old_data, new_data)
    VALUES (
      NEW.id,
      NEW.user_id,
      'modified',
      jsonb_build_object(
        'date', OLD.date,
        'duration', OLD.duration,
        'vehicle_type', OLD.vehicle_type,
        'spot_number', OLD.spot_number
      ),
      jsonb_build_object(
        'date', NEW.date,
        'duration', NEW.duration,
        'vehicle_type', NEW.vehicle_type,
        'spot_number', NEW.spot_number
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER audit_booking_insert
  AFTER INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_created();

CREATE TRIGGER audit_booking_delete
  AFTER DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_cancelled();

CREATE TRIGGER audit_booking_update
  AFTER UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.log_booking_modified();
