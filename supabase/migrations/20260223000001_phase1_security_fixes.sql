-- Phase 1 Security Remediation
-- Addresses: H2, H3, H4, H5, M6, M12

-- ============================================
-- FIX H2: Add WITH CHECK to UPDATE policy
-- Prevents user_id reassignment on bookings
-- ============================================
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
CREATE POLICY "Users can update their own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ============================================
-- FIX H3/H4/H5: Add UNIQUE constraint on (user_id, date)
-- Prevents duplicate bookings per user per date at DB level
-- Also resolves the TOCTOU race condition (H5) since
-- UNIQUE constraints use row-level locks
-- ============================================
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_user_date_unique UNIQUE (user_id, date);

-- ============================================
-- FIX M6: Revoke anon access to booking_availability
-- Only authenticated users should see availability data
-- ============================================
REVOKE SELECT ON public.booking_availability FROM anon;

-- ============================================
-- FIX M12: Prevent past-date bookings at DB level
-- ============================================
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_future_date CHECK (date >= CURRENT_DATE);
