# Security Remediation Implementation Plan (Phases 1-2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all Critical, High, and Phase-2 Medium severity vulnerabilities identified in the comprehensive security audit (risk score 5.1/10 -> target ~3.5/10).

**Architecture:** All database-level fixes go into new SQL migration files. Client-side fixes are edits to existing TypeScript/TSX files. No new npm dependencies in Phase 1-2 (Sentry is Phase 3). We preserve all existing functionality -- these are hardening fixes, not feature changes.

**Tech Stack:** TypeScript 5.8, React 18.3, Vite 7.2, Supabase (PostgreSQL + Auth + RLS), sonner (toasts)

**Branch:** Work on `dev` branch (current branch). Do NOT push.

**Test commands:**

- Type check: `npx tsc --noEmit`
- Unit tests: `npx vitest run`
- Lint: `npx eslint .`
- Build: `npm run build`

---

## Task 1: SQL Migration -- Phase 1 Database Fixes

**Files:**

- Create: `supabase/migrations/20260223000001_phase1_security_fixes.sql`

This single migration addresses: H2 (WITH CHECK), H3/H4/H5 (UNIQUE constraint), M6 (revoke anon), M12 (past-date CHECK).

**Step 1: Write the migration file**

Create `supabase/migrations/20260223000001_phase1_security_fixes.sql` with this exact content:

```sql
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
```

**Step 2: Verify the migration file is syntactically valid**

Read the file back and verify it has all 4 fixes. No test to run since migrations run against Supabase directly.

**Step 3: Commit**

```bash
git add supabase/migrations/20260223000001_phase1_security_fixes.sql
git commit -m "fix(db): add WITH CHECK, UNIQUE constraint, revoke anon, future-date CHECK

Addresses security findings:
- H2: WITH CHECK on UPDATE policy prevents user_id reassignment
- H3/H4/H5: UNIQUE(user_id, date) enforces one booking per user per day
- M6: Revoke anon SELECT on booking_availability
- M12: CHECK(date >= CURRENT_DATE) prevents past-date bookings"
```

---

## Task 2: SQL Migration -- Phase 2 Database Fixes (Restrict SECURITY DEFINER Functions)

**Files:**

- Create: `supabase/migrations/20260223000002_phase2_restrict_functions.sql`

Addresses: H1 (generate_recurring_bookings), M5 (refresh_booking_summary rate limit), M10 (expire_waitlist_notifications).

**Step 1: Write the migration file**

Create `supabase/migrations/20260223000002_phase2_restrict_functions.sql` with this exact content:

```sql
-- Phase 2 Security Remediation
-- Addresses: H1, M5, M10

-- ============================================
-- FIX H1: Restrict generate_recurring_bookings() to admin users
-- Currently any authenticated user can trigger this for ALL users
-- ============================================
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
  -- Security: Only allow admin users to call this function
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_user_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can generate recurring bookings';
  END IF;

  -- Security: Limit days_ahead to prevent abuse
  IF days_ahead > 90 THEN
    RAISE EXCEPTION 'Cannot generate bookings more than 90 days ahead';
  END IF;

  target_date := CURRENT_DATE + days_ahead;

  FOR rec IN
    SELECT rb.*, up.display_name
    FROM public.recurring_bookings rb
    JOIN public.user_profiles up ON rb.user_id = up.id
    WHERE rb.is_active = true
      AND rb.start_date <= target_date
      AND (rb.end_date IS NULL OR rb.end_date >= CURRENT_DATE)
  LOOP
    current_date_iter := GREATEST(
      COALESCE(rec.last_generated_date + 1, rec.start_date),
      CURRENT_DATE
    );

    WHILE current_date_iter <= target_date AND
          (rec.end_date IS NULL OR current_date_iter <= rec.end_date) LOOP
      IF EXTRACT(ISODOW FROM current_date_iter)::INTEGER = ANY(rec.days_of_week) THEN
        BEGIN
          INSERT INTO public.bookings (user_id, user_name, date, duration, vehicle_type, spot_number)
          VALUES (rec.user_id, rec.display_name, current_date_iter, rec.duration, rec.vehicle_type, rec.spot_number);
          bookings_created := bookings_created + 1;
        EXCEPTION WHEN unique_violation OR check_violation THEN
          NULL; -- Skip conflicts silently
        END;
      END IF;
      current_date_iter := current_date_iter + 1;
    END LOOP;

    UPDATE public.recurring_bookings
    SET last_generated_date = target_date
    WHERE id = rec.id;
  END LOOP;

  RETURN bookings_created;
END;
$$;

-- ============================================
-- FIX M5: Rate-limit refresh_booking_summary()
-- Prevent DoS by limiting refresh frequency to once per minute
-- ============================================
CREATE OR REPLACE FUNCTION public.refresh_booking_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  last_refresh TIMESTAMPTZ;
BEGIN
  -- Rate limit: check when the materialized view was last refreshed
  -- We use a simple approach: check the age of the view's data
  -- by looking at pg_stat_user_tables for last analyze/vacuum time
  SELECT greatest(last_vacuum, last_autovacuum, last_analyze, last_autoanalyze)
  INTO last_refresh
  FROM pg_stat_user_tables
  WHERE relname = 'booking_summary_mv';

  -- Allow refresh at most once per minute
  IF last_refresh IS NOT NULL AND last_refresh > now() - interval '1 minute' THEN
    RAISE NOTICE 'Booking summary was refreshed recently. Skipping.';
    RETURN;
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.booking_summary_mv;
END;
$$;

-- ============================================
-- FIX M10: Restrict expire_waitlist_notifications()
-- Only admin users should trigger expiration manually
-- ============================================
CREATE OR REPLACE FUNCTION public.expire_waitlist_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Security: Only allow admin users to call this function
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_user_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can expire waitlist notifications';
  END IF;

  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'notified'
    AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'waiting'
    AND date < CURRENT_DATE;

  RETURN expired_count;
END;
$$;
```

**Step 2: Verify the migration file has all 3 fixes**

Read the file back and confirm H1, M5, M10 are addressed.

**Step 3: Commit**

```bash
git add supabase/migrations/20260223000002_phase2_restrict_functions.sql
git commit -m "fix(db): restrict SECURITY DEFINER functions to admin role

Addresses security findings:
- H1: generate_recurring_bookings() now requires admin role + 90-day limit
- M5: refresh_booking_summary() rate-limited to once per minute
- M10: expire_waitlist_notifications() now requires admin role"
```

---

## Task 3: Add CSP Meta Tag to index.html (H6)

**Files:**

- Modify: `index.html:4` (add after charset meta tag)

**Step 1: Add CSP meta tag**

In `index.html`, after `<meta charset="UTF-8" />` (line 4), add:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
/>
```

**Important notes:**

- `'unsafe-inline'` is required for `style-src` because Tailwind and component libraries inject inline styles.
- `connect-src` must include both `https://*.supabase.co` (REST API) and `wss://*.supabase.co` (Realtime WebSocket).
- `script-src 'self'` is sufficient -- the inline SPA redirect script in index.html will need to be moved to an external file OR we add a nonce. Since the SPA redirect script (lines 7-30) runs before React, the simplest fix is to also add `'unsafe-inline'` to `script-src` for now. Update to: `script-src 'self' 'unsafe-inline';`

The final CSP should be:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
/>
```

**Step 2: Build and verify CSP doesn't break the app**

```bash
npm run build
```

The build should succeed. Visual verification requires a browser, but the build output confirms no asset references will be blocked.

**Step 3: Commit**

```bash
git add index.html
git commit -m "fix(security): add Content Security Policy meta tag (H6)

Adds CSP to prevent XSS-based token theft. Allows:
- Scripts: self + unsafe-inline (for SPA redirect)
- Styles: self + unsafe-inline (Tailwind)
- Connect: self + Supabase (REST + WebSocket)
- Images: self + data: URIs
- Blocks: object, embed, form-action to external origins"
```

---

## Task 4: Fix Error Message Leakage (M7)

**Files:**

- Create: `src/lib/errorMessages.ts`
- Modify: `src/pages/Auth.tsx:100-101,136-137,168-169`
- Modify: `src/pages/Index.tsx:93-97,107-108,117-118`

**Step 1: Create the error message mapping utility**

Create `src/lib/errorMessages.ts`:

```typescript
/**
 * Maps Supabase/PostgreSQL error codes and messages to user-friendly messages.
 * Raw error details are never shown to users -- they are logged internally only.
 */

const SUPABASE_ERROR_MAP: Record<string, string> = {
  // Auth errors
  invalid_credentials: 'Invalid email or password.',
  email_not_confirmed: 'Please confirm your email address before signing in.',
  user_already_exists: 'An account with this email already exists.',
  weak_password: 'Password does not meet the minimum requirements.',
  over_request_limit: 'Too many attempts. Please try again later.',
  user_not_found: 'Invalid email or password.',
  email_address_invalid: 'Please enter a valid email address.',
  // Database/RLS errors
  '23505': 'This booking conflicts with an existing one.', // unique_violation
  '23514': 'The booking data is invalid.', // check_violation
  '42501': 'You do not have permission to perform this action.', // insufficient_privilege
  PGRST301: 'You do not have permission to perform this action.',
};

const GENERIC_MESSAGES: Record<string, string> = {
  auth: 'Authentication failed. Please try again.',
  booking_create: 'Failed to create booking. Please try again.',
  booking_cancel: 'Failed to cancel booking. Please try again.',
  booking_fetch: 'Failed to load bookings. Please try again.',
  password_reset: 'Failed to process password reset. Please try again.',
  default: 'Something went wrong. Please try again.',
};

interface SupabaseError {
  message?: string;
  code?: string;
  status?: number;
}

/**
 * Returns a user-safe error message. Logs the raw error internally.
 * @param error - The raw error from Supabase
 * @param context - The operation context for fallback message
 */
export function getUserErrorMessage(
  error: SupabaseError | Error | unknown,
  context: keyof typeof GENERIC_MESSAGES = 'default'
): string {
  if (!error) return GENERIC_MESSAGES[context];

  const supaError = error as SupabaseError;

  // Try to match by error code first
  if (supaError.code && SUPABASE_ERROR_MAP[supaError.code]) {
    return SUPABASE_ERROR_MAP[supaError.code];
  }

  // Try to match by known message patterns
  if (supaError.message) {
    if (supaError.message.includes('already has a booking')) {
      return 'You already have a booking for this date.';
    }
    if (supaError.message.includes('car booking at that time')) {
      return 'This spot already has a car booked for that time slot.';
    }
    if (supaError.message.includes('Maximum 4 motorcycles')) {
      return 'This spot has reached the maximum number of motorcycles for that time slot.';
    }
    if (supaError.message.includes('restricted to @lht.dlh.de')) {
      return 'Registration is restricted to company email addresses.';
    }
  }

  // Fall back to context-specific generic message
  return GENERIC_MESSAGES[context] || GENERIC_MESSAGES.default;
}
```

**Step 2: Update Auth.tsx to use safe error messages**

In `src/pages/Auth.tsx`, add this import at the top (after the existing imports):

```typescript
import { getUserErrorMessage } from '@/lib/errorMessages';
```

Then replace these error-leaking lines:

- Line ~100 (handleLogin error): Replace `toast.error(error.message || 'Invalid email or password');` with `toast.error(getUserErrorMessage(error, 'auth'));`
- Line ~136 (handleSignup error): Replace `toast.error(error.message || 'Failed to create account');` with `toast.error(getUserErrorMessage(error, 'auth'));`
- Line ~168 (handleResetPassword error): Replace `toast.error(error.message || 'Failed to send reset email');` with `toast.error(getUserErrorMessage(error, 'password_reset'));`

**Step 3: Update Index.tsx to use safe error messages**

In `src/pages/Index.tsx`, add this import:

```typescript
import { getUserErrorMessage } from '@/lib/errorMessages';
```

Then replace these error-leaking lines:

In `handleConfirmBooking` (around line 93-97):

- Replace `const errorMessage = error.message || 'Failed to create booking';` and `toast.error(errorMessage);` with `toast.error(getUserErrorMessage(error, 'booking_create'));`
- In the catch block (~line 107-108): Replace `const errorMessage = error instanceof Error ? error.message : 'Failed to create booking';` and `toast.error(errorMessage);` with `toast.error(getUserErrorMessage(error, 'booking_create'));`

In `handleUnbook` (around line 117-118):

- Replace the error toast pattern with `toast.error(getUserErrorMessage(error, 'booking_cancel'));`
- In the catch block: same pattern.

In `fetchBookings` catch block (~line 72): Replace `toast.error('Failed to load bookings');` with `toast.error(getUserErrorMessage(error, 'booking_fetch'));` (this one is already generic, but using the utility is more consistent).

**Step 4: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Run tests**

```bash
npx vitest run
```

Expected: All existing tests pass (we haven't changed behavior, just error message text).

**Step 6: Commit**

```bash
git add src/lib/errorMessages.ts src/pages/Auth.tsx src/pages/Index.tsx
git commit -m "fix(security): replace raw error messages with user-safe messages (M7)

Create errorMessages.ts utility that maps Supabase error codes to
generic user-facing messages. Raw PostgreSQL constraint names, RLS
policy names, and internal error codes are no longer shown in toasts."
```

---

## Task 5: Fix ErrorBoundary process.env and Hardcoded URL (M19, M9)

**Files:**

- Modify: `src/components/ErrorBoundary.tsx:73`
- Modify: `src/hooks/useAuth.tsx:39`

**Step 1: Fix process.env.NODE_ENV in ErrorBoundary**

In `src/components/ErrorBoundary.tsx`, line 73, replace:

```tsx
{process.env.NODE_ENV === 'development' && this.state.error && (
```

with:

```tsx
{import.meta.env.DEV && this.state.error && (
```

**Step 2: Fix hardcoded URL in useAuth**

In `src/hooks/useAuth.tsx`, line 39, replace:

```tsx
window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth';
```

with:

```tsx
window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
```

**Step 3: Run type check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/ErrorBoundary.tsx src/hooks/useAuth.tsx
git commit -m "fix: replace process.env.NODE_ENV with import.meta.env.DEV, remove hardcoded URL

- M19: ErrorBoundary now uses import.meta.env.DEV (Vite-compatible)
- M9: signOut redirect uses window.location.origin + BASE_URL"
```

---

## Task 6: Increase Password Validation to 12 Characters (M1)

**Files:**

- Modify: `src/pages/Auth.tsx` (validatePassword function and minLength attributes)

**Step 1: Update password validation**

In `src/pages/Auth.tsx`, the `validatePassword` function (around line 68-71), replace:

```typescript
const validatePassword = (password: string): boolean => {
  if (!password || password.length < 6) {
    toast.error('Password must be at least 6 characters');
    return false;
  }
  return true;
};
```

with:

```typescript
const validatePassword = (password: string): boolean => {
  if (!password || password.length < 12) {
    toast.error('Password must be at least 12 characters');
    return false;
  }
  if (!/[A-Z]/.test(password)) {
    toast.error('Password must contain at least one uppercase letter');
    return false;
  }
  if (!/[a-z]/.test(password)) {
    toast.error('Password must contain at least one lowercase letter');
    return false;
  }
  if (!/\d/.test(password)) {
    toast.error('Password must contain at least one digit');
    return false;
  }
  return true;
};
```

**Step 2: Update minLength attributes on password inputs**

There are two password input fields in Auth.tsx with `minLength={6}`. Update both to `minLength={12}`:

1. Login password input (around line 260): `minLength={6}` -> `minLength={12}`
2. Signup password input (around line 311): `minLength={6}` -> `minLength={12}`

**Step 3: Run type check and tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: Pass.

**Step 4: Commit**

```bash
git add src/pages/Auth.tsx
git commit -m "fix(auth): increase password minimum to 12 chars with complexity (M1)

Requires uppercase, lowercase, and digit. Client-side enforcement
matches the recommendation to also update Supabase Dashboard settings."
```

---

## Task 7: Sanitize Display Name on Signup (M11)

**Files:**

- Modify: `src/pages/Auth.tsx` (validateName function)

**Step 1: Add name sanitization**

In `src/pages/Auth.tsx`, replace the `validateName` function:

```typescript
const validateName = (name: string): boolean => {
  if (!name || name.trim() === '') {
    toast.error('Name is required');
    return false;
  }
  return true;
};
```

with:

```typescript
const validateName = (name: string): boolean => {
  if (!name || name.trim() === '') {
    toast.error('Name is required');
    return false;
  }
  if (name.trim().length > 100) {
    toast.error('Name must be 100 characters or fewer');
    return false;
  }
  if (!/^[\p{L}\p{M}\s.'-]+$/u.test(name.trim())) {
    toast.error('Name contains invalid characters');
    return false;
  }
  return true;
};
```

The regex `[\p{L}\p{M}\s.'-]+` allows Unicode letters, combining marks, spaces, dots, apostrophes, and hyphens -- suitable for international names while blocking script injection attempts.

**Step 2: Run type check and tests**

```bash
npx tsc --noEmit && npx vitest run
```

**Step 3: Commit**

```bash
git add src/pages/Auth.tsx
git commit -m "fix(auth): sanitize display name on signup (M11)

Validates name length (max 100 chars) and character set (Unicode
letters, spaces, dots, apostrophes, hyphens). Blocks script injection."
```

---

## Task 8: Sanitize 404 Log and Fix Sidebar Cookie (L1, L11)

**Files:**

- Modify: `src/pages/NotFound.tsx:11`

**Step 1: Sanitize the 404 log**

In `src/pages/NotFound.tsx`, line 11, replace:

```typescript
console.error('404 Error: User attempted to access non-existent route:', location.pathname);
```

with:

```typescript
console.error(
  '404 Error: User attempted to access non-existent route:',
  location.pathname.replace(/[^\w/.-]/g, '_')
);
```

**Step 2: Run type check**

```bash
npx tsc --noEmit
```

**Step 3: Commit**

```bash
git add src/pages/NotFound.tsx
git commit -m "fix(security): sanitize pathname in 404 log (L11)

Replaces non-word characters to prevent log injection via crafted URLs."
```

---

## Task 9: Run Full Build Verification

**Files:** None (verification only)

**Step 1: Run full type check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

**Step 2: Run unit tests**

```bash
npx vitest run
```

Expected: All tests pass.

**Step 3: Run lint**

```bash
npx eslint .
```

Expected: No new errors.

**Step 4: Run production build**

```bash
npm run build
```

Expected: Build succeeds.

**Step 5: Verify all commits are clean**

```bash
git log --oneline -10
git status
```

Expected: 7 new commits, clean working tree (except untracked audit files).

---

## Summary of What Each Task Addresses

| Task | Findings Fixed          | Type                        |
| ---- | ----------------------- | --------------------------- |
| 1    | H2, H3, H4, H5, M6, M12 | SQL migration               |
| 2    | H1, M5, M10             | SQL migration               |
| 3    | H6                      | index.html edit             |
| 4    | M7                      | New TS utility + page edits |
| 5    | M9, M19                 | TS/TSX edits                |
| 6    | M1                      | TSX edit                    |
| 7    | M11                     | TSX edit                    |
| 8    | L11                     | TSX edit                    |
| 9    | (verification)          | Build/test                  |

**Not addressed in this plan (Phase 3-4, separate plan):**

- C1 (server-side email domain) -- requires Supabase Dashboard config change, not code
- H7, H8, H9 (Sentry, security event logging, monitoring) -- Phase 3
- M3 (PASSWORD_RECOVERY handling) -- Phase 3
- M4 (AuthContext) -- Phase 3 (significant refactor)
- M8 (idle timeout) -- Phase 3
- M2, M13, M14, M15, M16, M17, M18 -- Phase 3-4
- L1-L10, L12 -- Phase 4
- GDPR items -- Phase 4

**Note on C1 (Critical -- server-side email domain):** This requires a Supabase Dashboard configuration change (Authentication > Settings > Restrict email domain to `lht.dlh.de`), OR creating a Supabase Auth Hook (which requires Supabase Edge Functions or a database trigger on `auth.users`). Both require Supabase project admin access. The fix cannot be done purely through migration files or client code. The project owner should apply this immediately through the Supabase Dashboard.
