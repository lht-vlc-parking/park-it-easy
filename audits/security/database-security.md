# Database Security Audit

**Date:** 2026-02-23
**Auditor:** Security Audit (Automated)
**Scope:** All 21 SQL migrations, client-side DB access hooks/services, configuration files
**Application:** park-it-easy-office v2.3.3 (Vite/React 18/TypeScript 5.8 SPA + Supabase PostgreSQL)
**Risk Score: 5.8 / 10**

---

## Findings

### F1 — Missing `WITH CHECK` on Bookings UPDATE RLS Policy

|                    |                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                               |
| **CWE**            | CWE-863 (Incorrect Authorization)                                                                                                                                                                                                                                                                                                                                      |
| **Evidence**       | `supabase/migrations/20260102000002_fix_remaining_security_issues.sql:69-75`                                                                                                                                                                                                                                                                                           |
| **What**           | The final UPDATE policy for `bookings` has a `USING` clause but no `WITH CHECK` clause. This means an authenticated user can update a row they own (passes `USING`) but the updated row is not re-validated against `user_id = auth.uid()`. A user could change the `user_id` column to another user's ID, effectively transferring or forging ownership of a booking. |
| **Why it matters** | An attacker can modify `user_id` on their booking to another user's UUID, causing the booking to appear as someone else's. Combined with `user_name` string matching in the UI (see F2), this enables impersonation and data integrity violations.                                                                                                                     |

**Exploitability:** Medium. Requires knowledge of another user's UUID (obtainable from `user_booking_stats` view which exposes `user_id`). A single Supabase JS call: `supabase.from('bookings').update({ user_id: 'victim-uuid' }).eq('id', 'my-booking-id')`.

**Remediation:**

```sql
-- Drop and recreate the UPDATE policy with WITH CHECK
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
CREATE POLICY "Users can update their own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
```

---

### F2 — Identity Based on `user_name` String Instead of `user_id` (IDOR)

|                    |                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                            |
| **CWE**            | CWE-639 (Authorization Bypass Through User-Controlled Key)                                                                                                                                                                                                                                                                                          |
| **Evidence**       | `src/pages/Index.tsx:142-143`, `src/pages/Statistics.tsx:266-267`                                                                                                                                                                                                                                                                                   |
| **What**           | The client determines "my bookings" by comparing `booking.userName` against `user?.user_metadata?.user_name \|\| user?.email`. The `user_name` column is a freetext `TEXT` field set at insert time from user metadata — it is not a foreign key or unique identifier. Any user can set their `user_name` metadata to match another user's name.    |
| **Why it matters** | A user who changes their metadata `user_name` to match someone else's can see the "Cancel" button on that user's bookings in the UI. While RLS prevents the actual delete (RLS checks `user_id`), the UI logic leaks "is this my booking?" based on an attacker-controllable string. In `Statistics.tsx`, it exposes another user's personal stats. |

**Exploitability:** Low for data modification (RLS blocks the delete), Medium for information disclosure and UI confusion.

**Remediation:**

```tsx
// Index.tsx — compare by user_id, not user_name
// Replace line 142:
const myBookings = bookings.filter(b => b.userName === userName);
// With:
const myBookings = bookings.filter(b => b.user_id === user?.id);

// And line 292 (isMyBooking check):
const isMyBooking = booking.user_id === user?.id;

// Requires adding user_id to the Booking interface and transformedBookings mapping
```

---

### F3 — `generate_recurring_bookings()` SECURITY DEFINER Callable by Any Authenticated User

|                    |                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                             |
| **CWE**            | CWE-269 (Improper Privilege Management)                                                                                                                                                                                                                                                                                                                                                              |
| **Evidence**       | `supabase/migrations/20260103000004_v2_recurring_bookings.sql:75-135`                                                                                                                                                                                                                                                                                                                                |
| **What**           | The function `generate_recurring_bookings(days_ahead INTEGER)` is `SECURITY DEFINER` (runs as the function owner — typically `postgres`) and is granted `EXECUTE` to the `authenticated` role. Any authenticated user can call this function with an arbitrary `days_ahead` value (e.g., `365000`), causing it to generate bookings for ALL users' recurring patterns across an enormous date range. |
| **Why it matters** | (1) A single user can trigger bulk insert of thousands of bookings for all users, causing resource exhaustion and data pollution. (2) As `SECURITY DEFINER`, it bypasses RLS — it inserts bookings on behalf of other users. (3) No rate limiting or authorization check inside the function body.                                                                                                   |

**Exploitability:** High. Any authenticated user can call: `supabase.rpc('generate_recurring_bookings', { days_ahead: 99999 })`.

**Remediation:**

```sql
-- Option A: Restrict to service_role only (called by cron/edge function)
REVOKE EXECUTE ON FUNCTION public.generate_recurring_bookings(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_bookings(INTEGER) TO service_role;

-- Option B: Add guard inside the function
CREATE OR REPLACE FUNCTION public.generate_recurring_bookings(days_ahead INTEGER DEFAULT 14)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only allow service_role or specific admin check
  IF current_setting('request.jwt.claim.role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Only service_role can call this function';
  END IF;
  -- Clamp days_ahead to a reasonable maximum
  IF days_ahead > 30 THEN
    days_ahead := 30;
  END IF;
  -- ... rest of function
END;
$$;
```

---

### F4 — `refresh_booking_summary()` SECURITY DEFINER Callable by Any Authenticated User

|                    |                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                                                 |
| **CWE**            | CWE-269 (Improper Privilege Management)                                                                                                                                                    |
| **Evidence**       | `supabase/migrations/20260103000006_v2_statistics_views.sql:147-159`                                                                                                                       |
| **What**           | The function `refresh_booking_summary()` runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` as `SECURITY DEFINER` and is granted to `authenticated`. Any user can call it repeatedly.           |
| **Why it matters** | `REFRESH MATERIALIZED VIEW CONCURRENTLY` acquires an `EXCLUSIVE` lock and performs a full table scan. Repeated calls cause resource exhaustion (CPU, I/O) and potential denial of service. |

**Exploitability:** High. Trivially called in a loop: `for(let i=0;i<1000;i++) supabase.rpc('refresh_booking_summary')`.

**Remediation:**

```sql
REVOKE EXECUTE ON FUNCTION public.refresh_booking_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_booking_summary() TO service_role;
-- Call from a Supabase cron job / edge function using service_role key
```

---

### F5 — `booking_availability` View Granted to `anon` Role

|                    |                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                             |
| **CWE**            | CWE-284 (Improper Access Control)                                                                                                                                                                                                                                                      |
| **Evidence**       | `supabase/migrations/20260102000001_fix_security_issues.sql:22`                                                                                                                                                                                                                        |
| **What**           | The `booking_availability` view is granted to both `anon` and `authenticated`. The `anon` role is the unauthenticated public API role in Supabase. This means anyone with the Supabase URL and anon key (both public in a SPA) can query booking availability data without logging in. |
| **Why it matters** | While the view only exposes aggregate counts (no PII), it reveals when spots are booked and when they're free. This is information leakage about office usage patterns to unauthenticated parties. It also broadens the attack surface unnecessarily.                                  |

**Exploitability:** Low impact, high ease. `curl https://xxx.supabase.co/rest/v1/booking_availability -H "apikey: anon-key"`.

**Remediation:**

```sql
REVOKE SELECT ON public.booking_availability FROM anon;
-- Only authenticated users should see booking data
```

---

### F6 — Client-Only Email Domain Restriction (No Server-Side Enforcement)

|                    |                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                          |
| **CWE**            | CWE-602 (Client-Side Enforcement of Server-Side Security)                                                                                                                                                                                                                                                         |
| **Evidence**       | `src/pages/Auth.tsx:14,53-66`                                                                                                                                                                                                                                                                                     |
| **What**           | The `@lht.dlh.de` email domain restriction exists only in the React `validateEmail()` function on the client side. There is no corresponding check in Supabase Auth configuration, no database trigger, and no RLS policy that validates the email domain.                                                        |
| **Why it matters** | An attacker can bypass the client validation by calling Supabase Auth directly: `supabase.auth.signUp({ email: 'attacker@evil.com', password: '...' })`. This creates a fully authenticated user with access to all booking data and operations. The domain restriction is the only tenant/organization boundary. |

**Exploitability:** Critical. Direct API call or modified JS in browser console completely bypasses the check.

**Remediation:**

```sql
-- Option A: Supabase Auth hook (recommended — Edge Function)
-- In supabase/functions/auth-hook/index.ts:
-- Check email domain and reject if not @lht.dlh.de

-- Option B: Database trigger on auth.users (requires SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.enforce_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.email IS NULL OR NOT NEW.email LIKE '%@lht.dlh.de' THEN
    RAISE EXCEPTION 'Only @lht.dlh.de email addresses are allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_email_domain_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_email_domain();
```

---

### F7 — `SELECT *` Usage Across All Client Queries

|                    |                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                          |
| **CWE**            | CWE-200 (Exposure of Sensitive Information)                                                                                                                                                                                                                                                                                                                      |
| **Evidence**       | `src/pages/Index.tsx:47`, `src/pages/Statistics.tsx:64`, `src/hooks/useStatistics.ts:49`, `src/hooks/useParkingSpots.ts:28-34`, `src/hooks/useWaitlist.ts:29`, `src/hooks/useRecurringBookings.ts:23`, `src/hooks/useBookingAudit.ts:21`, `src/hooks/useUserProfile.ts:20`, `src/services/bookingService.ts:100,248,323`                                         |
| **What**           | Every Supabase query uses `.select('*')` instead of selecting only needed columns. This returns all columns including `user_id`, `created_at`, `ip_address`, `user_agent`, and other metadata that the client may not need.                                                                                                                                      |
| **Why it matters** | Over-fetching increases payload size and exposes more data to the browser than necessary. For `booking_audit`, this includes `ip_address` and `user_agent` columns (though currently only populated by SECURITY DEFINER triggers, future changes could expose PII). The `user_booking_stats` view exposes all user's `user_id` values to any authenticated user. |

**Exploitability:** Low. Data is already accessible via RLS, but minimization reduces blast radius.

**Remediation:**

```ts
// Example: Index.tsx fetchBookings
const { data, error } = await supabase
  .from('bookings')
  .select('id, date, duration, vehicle_type, user_name, spot_number, user_id, created_at')
  .order('date', { ascending: true });
```

---

### F8 — No Pagination or Query Limits on Booking Fetches

|                    |                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                        |
| **CWE**            | CWE-770 (Allocation of Resources Without Limits)                                                                                                                                                                                                                                  |
| **Evidence**       | `src/pages/Index.tsx:45-48`, `src/pages/Statistics.tsx:62-66`                                                                                                                                                                                                                     |
| **What**           | Both `Index.tsx` and `Statistics.tsx` fetch ALL bookings without any `.limit()` or date range constraint. As the dataset grows, this results in unbounded queries. The Supabase PostgREST default limit is 1000 rows, but even that can be overridden by client (`Range` header). |
| **Why it matters** | Performance degradation over time. An attacker who bulk-creates bookings (possible via `generate_recurring_bookings`) could force the client to download and process enormous result sets. Server-side, unbounded queries strain the connection pool.                             |

**Exploitability:** Low for security, Medium for availability.

**Remediation:**

```ts
// Add reasonable limits and date filtering
const { data, error } = await supabase
  .from('bookings')
  .select('id, date, duration, vehicle_type, user_name, spot_number, user_id, created_at')
  .gte('date', today) // Only future bookings for Index
  .order('date', { ascending: true })
  .limit(200);
```

---

### F9 — `parking_spots` Table Has No INSERT/UPDATE/DELETE RLS Policies

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **CWE**            | CWE-862 (Missing Authorization)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Evidence**       | `supabase/migrations/20260103000002_v2_parking_spots.sql:25-32`                                                                                                                                                                                                                                                                                                                                                                                     |
| **What**           | The `parking_spots` table has RLS enabled and a SELECT policy for `authenticated`, but no INSERT, UPDATE, or DELETE policies. By default, RLS blocks all operations without a matching policy. However, if an admin ever runs `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` or adds a permissive policy without proper role checks, any authenticated user could modify parking spot configuration. Currently safe due to default-deny, but fragile. |
| **Why it matters** | The comment says "only admins can modify" but there is no admin role defined anywhere in the schema. There is no way for legitimate admins to manage spots through the application. The table was populated via migration only.                                                                                                                                                                                                                     |

**Exploitability:** Currently blocked by default-deny RLS. Risk is in future misconfiguration.

**Remediation:**

```sql
-- Explicitly deny mutations to non-admins (defense in depth)
-- Option: Create an admin check and add policies
CREATE POLICY "No one can insert parking spots via API"
  ON public.parking_spots
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE POLICY "No one can update parking spots via API"
  ON public.parking_spots
  FOR UPDATE
  TO authenticated
  USING (false);

CREATE POLICY "No one can delete parking spots via API"
  ON public.parking_spots
  FOR DELETE
  TO authenticated
  USING (false);
```

---

### F10 — `user_booking_stats` View Exposes All Users' Data to All Authenticated Users

|                    |                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                            |
| **CWE**            | CWE-200 (Exposure of Sensitive Information)                                                                                                                                                                                                                                                                                           |
| **Evidence**       | `supabase/migrations/20260112000001_fix_security_definer_views.sql:125-150`                                                                                                                                                                                                                                                           |
| **What**           | The `user_booking_stats` view joins `user_profiles` with `bookings` and is `SECURITY INVOKER`. Since the bookings SELECT policy allows all authenticated users to read all bookings, any authenticated user can query `user_booking_stats` and see every user's `user_id`, `display_name`, `department`, and full booking statistics. |
| **Why it matters** | Exposes per-user booking patterns, department affiliation, and usage metrics. While this may be acceptable for a team tool with "team-wide visibility" as a design goal, the `user_id` (UUID) exposure enables attacks like F1 (UPDATE without WITH CHECK).                                                                           |

**Exploitability:** Low. Information disclosure, but combined with F1 enables privilege escalation.

**Remediation:**

```sql
-- Remove user_id from the view, or accept the risk for team transparency
CREATE OR REPLACE VIEW public.user_booking_stats
WITH (security_invoker = true) AS
SELECT
  -- up.id as user_id,  -- REMOVE: prevents IDOR vector
  up.display_name,
  up.department,
  COUNT(b.id) as total_bookings,
  -- ... rest of columns
```

---

### F11 — `waitlist_with_users` View Exposes Email via Join

|                    |                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                                  |
| **CWE**            | CWE-200 (Exposure of Sensitive Information)                                                                                                                                                                                                                                                                                                                              |
| **Evidence**       | `supabase/migrations/20260112000001_fix_security_definer_views.sql:152-166`                                                                                                                                                                                                                                                                                              |
| **What**           | The `waitlist_with_users` view is `SECURITY INVOKER` and joins `booking_waitlist` with `user_profiles`, including `up.email`. The waitlist RLS only allows users to see their own entries, so the email exposure is limited to the current user's own email. However, if the waitlist RLS policy ever changes to allow broader visibility, user emails would be exposed. |
| **Why it matters** | Email addresses are PII. The view design couples data that should remain separate.                                                                                                                                                                                                                                                                                       |

**Exploitability:** Currently safe due to RLS. Risk is in future policy changes.

**Remediation:**

```sql
-- Remove email from the view
CREATE OR REPLACE VIEW public.waitlist_with_users
WITH (security_invoker = true) AS
SELECT
  w.*,
  up.display_name
  -- Remove: up.email
FROM public.booking_waitlist w
JOIN public.user_profiles up ON w.user_id = up.id
WHERE w.status = 'waiting'
ORDER BY w.date, w.spot_number, w.position;
```

---

### F12 — SECURITY DEFINER Audit Trigger Functions Run as Owner

|                    |                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                                       |
| **CWE**            | CWE-250 (Execution with Unnecessary Privileges)                                                                                                                                                                                                                                                                                                                               |
| **Evidence**       | `supabase/migrations/20260103000003_v2_booking_audit.sql:40-121`                                                                                                                                                                                                                                                                                                              |
| **What**           | The three audit logging functions (`log_booking_created`, `log_booking_cancelled`, `log_booking_modified`) are `SECURITY DEFINER`. This is necessary because they insert into `booking_audit` which has no INSERT RLS policy for `authenticated`. However, running as the function owner (typically `postgres`) means these functions operate with full superuser privileges. |
| **Why it matters** | If any of these functions had a SQL injection vulnerability (they don't currently — they use direct column references), the impact would be catastrophic. The `SECURITY DEFINER` + `SET search_path = public, pg_temp` is the correct pattern, but the audit table should have its own INSERT policy scoped to trigger operations to enable `SECURITY INVOKER` instead.       |

**Exploitability:** Low. No current injection vector, but represents unnecessary privilege.

**Remediation:**
Accept current risk (triggers are the standard pattern for audit logging) or add an INSERT policy:

```sql
-- Allow the trigger to insert audit records via SECURITY INVOKER
CREATE POLICY "System can insert audit records"
  ON public.booking_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
-- Then change functions to SECURITY INVOKER
```

---

### F13 — `ip_address` and `user_agent` Audit Columns Never Populated

|                    |                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Low**                                                                                                                                                                                          |
| **CWE**            | CWE-778 (Insufficient Logging)                                                                                                                                                                   |
| **Evidence**       | `supabase/migrations/20260103000003_v2_booking_audit.sql:15-16`                                                                                                                                  |
| **What**           | The `booking_audit` table has `ip_address INET` and `user_agent TEXT` columns, but the trigger functions (`log_booking_created`, etc.) never populate them. These fields are always `NULL`.      |
| **Why it matters** | Audit logging is incomplete. In case of a security incident, there is no way to trace actions back to a specific client or network origin. The schema promises more audit data than it delivers. |

**Exploitability:** N/A — this is a logging gap, not an exploit vector.

**Remediation:**

```sql
-- In trigger functions, capture request headers (Supabase-specific):
INSERT INTO public.booking_audit (booking_id, user_id, action, new_data, ip_address, user_agent)
VALUES (
  NEW.id,
  NEW.user_id,
  'created',
  jsonb_build_object(...),
  inet(current_setting('request.headers', true)::json->>'x-forwarded-for'),
  current_setting('request.headers', true)::json->>'user-agent'
);
```

---

### F14 — `user_name` Column in Bookings Is Denormalized and Mutable

|                    |                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                   |
| **CWE**            | CWE-915 (Improperly Controlled Modification of Dynamically-Determined Object Attributes)                                                                                                                                                                                                                                     |
| **Evidence**       | `supabase/migrations/20251009223514_5a158dda-acc7-4b46-a082-d2ebf10da4f3.sql:8`, `src/pages/Index.tsx:86`                                                                                                                                                                                                                    |
| **What**           | The `bookings.user_name` column is a freetext `TEXT NOT NULL` field that is set by the client at insert time: `user.user_metadata?.user_name \|\| user.email \|\| 'Unknown'`. There is no database constraint linking it to the actual user's profile or enforcing consistency. A user can insert any string as `user_name`. |
| **Why it matters** | (1) Users can impersonate others by setting `user_name` to someone else's name. (2) If a user changes their display name, historical bookings retain the old name. (3) The field is used for identity matching in the UI (see F2). (4) The RLS INSERT policy only validates `user_id`, not `user_name`.                      |

**Exploitability:** Medium. Direct API call: `supabase.from('bookings').insert({ user_id: myId, user_name: 'CEO Name', ... })`.

**Remediation:**

```sql
-- Option A: Remove user_name from bookings, join with user_profiles
-- Option B: Validate user_name in a trigger
CREATE OR REPLACE FUNCTION public.validate_booking_user_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actual_name TEXT;
BEGIN
  SELECT display_name INTO actual_name
  FROM public.user_profiles WHERE id = NEW.user_id;

  IF actual_name IS NOT NULL THEN
    NEW.user_name := actual_name;  -- Force correct name
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_booking_user_name
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.validate_booking_user_name();
```

---

### F15 — No Query Timeout Configuration Visible

|                    |                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                            |
| **CWE**            | CWE-400 (Uncontrolled Resource Consumption)                                                                                                                                                                                                                                        |
| **Evidence**       | Unable to verify — no `statement_timeout` or `lock_timeout` in any migration                                                                                                                                                                                                       |
| **What**           | No `statement_timeout` or `lock_timeout` is set for the `authenticated` or `anon` roles in any migration file. Supabase sets a default `statement_timeout` on its managed platform (typically 8 seconds for API requests), but this is not configured in the project's migrations. |
| **Why it matters** | Long-running queries from malformed requests or adversarial input could tie up database connections. The `generate_recurring_bookings` function with a large `days_ahead` could run for minutes.                                                                                   |

**Exploitability:** Depends on Supabase platform defaults (typically safe in hosted Supabase). Risk is higher for self-hosted.

**Remediation:**

```sql
-- Add to a migration
ALTER ROLE authenticated SET statement_timeout = '10s';
ALTER ROLE anon SET statement_timeout = '5s';
ALTER ROLE authenticated SET lock_timeout = '5s';
```

---

### F16 — No Data Retention or Deletion Mechanism

|                    |                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-459 (Incomplete Cleanup)                                                                                                                                                                                                                                                    |
| **Evidence**       | All 21 migration files — no TTL, partitioning, or cleanup functions                                                                                                                                                                                                             |
| **What**           | There is no mechanism to delete old bookings, expired waitlist entries, or aging audit records. The `expire_waitlist_notifications` function marks old waitlist entries as `expired` but doesn't delete them. Bookings accumulate indefinitely.                                 |
| **Why it matters** | (1) Growing table sizes degrade query performance. (2) Retaining historical booking data with user names indefinitely may conflict with data minimization requirements (GDPR Art. 5(1)(e)). (3) `booking_audit` with `old_data`/`new_data` JSONB columns will grow unboundedly. |

**Exploitability:** N/A — operational/compliance risk.

**Remediation:**

```sql
-- Periodic cleanup function (call via cron)
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Delete bookings older than 1 year
  DELETE FROM public.bookings WHERE date < CURRENT_DATE - INTERVAL '1 year';
  -- Delete expired waitlist entries older than 30 days
  DELETE FROM public.booking_waitlist
  WHERE status IN ('expired', 'fulfilled')
    AND created_at < now() - INTERVAL '30 days';
  -- Delete audit records older than 2 years
  DELETE FROM public.booking_audit
  WHERE created_at < now() - INTERVAL '2 years';
END;
$$;
```

---

### F17 — `handle_new_user()` SECURITY DEFINER Trigger Trusts `raw_user_meta_data`

|                    |                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                             |
| **CWE**            | CWE-20 (Improper Input Validation)                                                                                                                                                                                                                                                                     |
| **Evidence**       | `supabase/migrations/20260103000001_v2_user_profiles.sql:49-64`                                                                                                                                                                                                                                        |
| **What**           | The `handle_new_user()` trigger runs as SECURITY DEFINER and reads `NEW.raw_user_meta_data->>'user_name'` to set the `display_name`. The `raw_user_meta_data` is controlled by the client during signup (`options.data.user_name`). No sanitization, length limit, or character validation is applied. |
| **Why it matters** | A user can set their display name to any string including: (1) very long strings (no `CHECK` constraint on `display_name`), (2) strings containing HTML/script tags (XSS if rendered unsafely), (3) strings impersonating other users or containing misleading content.                                |

**Exploitability:** Medium. Sign up with `user_name: '<script>alert(1)</script>'` or a 10MB string.

**Remediation:**

```sql
-- Add CHECK constraint to user_profiles
ALTER TABLE public.user_profiles
ADD CONSTRAINT display_name_length CHECK (length(display_name) <= 100);

-- Sanitize in trigger
NEW.display_name := left(
  regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'user_name', NEW.email),
    '[<>"'']', '', 'g'
  ),
  100
);
```

---

### F18 — `expire_waitlist_notifications()` SECURITY DEFINER Granted to Public

|                    |                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                             |
| **CWE**            | CWE-269 (Improper Privilege Management)                                                                                                                                                                                                             |
| **Evidence**       | `supabase/migrations/20260103000005_v2_waitlist.sql:126-151`                                                                                                                                                                                        |
| **What**           | The `expire_waitlist_notifications()` function is `SECURITY DEFINER` but has no explicit `GRANT` statement. In Supabase, functions are executable by `public` by default unless restricted. This means both `anon` and `authenticated` can call it. |
| **Why it matters** | While the function only expires stale notifications (low impact), it runs as the function owner and could be called repeatedly by unauthenticated users, causing unnecessary database writes.                                                       |

**Exploitability:** Low. The function is idempotent but still consumes resources.

**Remediation:**

```sql
REVOKE EXECUTE ON FUNCTION public.expire_waitlist_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_notifications() TO service_role;
```

---

## Summary Risk Score: 5.8/10

The codebase demonstrates good security awareness with proper use of RLS, `SECURITY INVOKER` views, and `search_path` hardening. However, several significant issues remain:

- **Critical gap:** Client-only email domain restriction (F6) means the primary tenant boundary is unenforced
- **Authorization bugs:** Missing `WITH CHECK` on UPDATE (F1) and identity based on mutable strings (F2, F14)
- **Over-privileged functions:** Three `SECURITY DEFINER` functions callable by any authenticated user (F3, F4, F18)
- **No admin role:** The system has no concept of admin vs. regular user, making privilege escalation moot but limiting operational capability

## Top 5 Prioritized Fixes

1. **F6 — Server-side email domain enforcement.** This is the most critical gap. Without it, anyone can create an account and access all data. Add a Supabase Auth hook or database trigger immediately.

2. **F3 — Restrict `generate_recurring_bookings` to `service_role`.** This function allows any user to create bookings for all users with arbitrary date ranges. Revoke `authenticated` access.

3. **F1 — Add `WITH CHECK` to bookings UPDATE policy.** Prevents user_id tampering on updates. One-line SQL fix.

4. **F14 + F2 — Enforce `user_name` consistency and switch UI identity checks to `user_id`.** Either validate `user_name` via trigger or remove it from the bookings table and join with `user_profiles`.

5. **F4 — Restrict `refresh_booking_summary` to `service_role`.** Prevents any authenticated user from triggering expensive materialized view refreshes.

---

## Checklist (Pass/Fail/N/A)

| #   | Item                                        | Status      | Notes                                                                                                                                                                                         |
| --- | ------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Parameterized queries or ORM usage          | **Pass**    | Supabase JS client uses parameterized queries internally. No raw SQL in client code. `bookingService.ts` validates with Zod schemas.                                                          |
| 2   | Connection string security                  | **Pass**    | No direct DB connection strings in client. Uses Supabase anon key via `VITE_SUPABASE_PUBLISHABLE_KEY` env var. `.env.example` has placeholder values. No `.env` file committed.               |
| 3   | Database user permissions (least privilege) | **Fail**    | F3, F4: `SECURITY DEFINER` functions granted to `authenticated`. No admin role separation. `anon` has access to `booking_availability` view (F5).                                             |
| 4   | Sensitive data encryption at rest           | **Pass**    | Supabase managed PostgreSQL provides encryption at rest by default (AES-256). Unable to verify custom encryption for PII columns.                                                             |
| 5   | PII handling compliance                     | **Fail**    | Email in `user_profiles` and `waitlist_with_users` view (F11). `user_name` stored denormalized in `bookings` and `booking_audit.new_data` JSONB. No anonymization mechanism.                  |
| 6   | Query timeout configurations                | **Fail**    | F15: No `statement_timeout` configured in migrations. Relies on Supabase platform defaults.                                                                                                   |
| 7   | Connection pool settings                    | **N/A**     | Managed by Supabase platform. Client uses Supabase JS SDK which manages HTTP connections.                                                                                                     |
| 8   | Transaction handling                        | **Pass**    | Trigger functions use implicit transactions. `generate_recurring_bookings` uses exception handling for conflict resolution.                                                                   |
| 9   | Audit logging for sensitive operations      | **Partial** | Booking CRUD is logged via triggers (F12). But `ip_address`/`user_agent` never populated (F13). No audit for auth events, profile changes, or admin actions.                                  |
| 10  | NoSQL injection hardening                   | **N/A**     | PostgreSQL only. No NoSQL databases.                                                                                                                                                          |
| 11  | Row/Tenant isolation (RLS)                  | **Partial** | RLS enabled on all tables. Policies mostly correct. F1: Missing `WITH CHECK` on UPDATE. F5: `anon` access to view. F9: No mutation policies on `parking_spots`.                               |
| 12  | Least-privilege networking                  | **N/A**     | Supabase managed. Docker compose only runs dev server, no DB.                                                                                                                                 |
| 13  | TLS in transit                              | **Pass**    | Supabase client connects over HTTPS. `createClient` uses HTTPS URLs.                                                                                                                          |
| 14  | Secret management & rotation                | **Pass**    | Only the anon key is used (public by design). No service_role key in client code. Env vars validated by Zod in `src/lib/env.ts`. No secrets in docker-compose.yml.                            |
| 15  | Schema & integrity controls                 | **Pass**    | Proper use of enums (`booking_duration`, `vehicle_type`, etc.), CHECK constraints, UNIQUE constraints, foreign keys with `ON DELETE CASCADE`.                                                 |
| 16  | Field-level minimization (avoid SELECT \*)  | **Fail**    | F7: Every client query uses `.select('*')`.                                                                                                                                                   |
| 17  | Pagination & query limits                   | **Fail**    | F8: No `.limit()` on main booking queries. Only `useBookingAudit.ts:25` uses `.limit(limit)`.                                                                                                 |
| 18  | Backup/restore security                     | **N/A**     | Managed by Supabase platform. Not configurable in application code.                                                                                                                           |
| 19  | Data retention & deletion                   | **Fail**    | F16: No cleanup mechanism for old data. Bookings and audit records grow indefinitely.                                                                                                         |
| 20  | Migrations safety                           | **Pass**    | Migrations use `IF NOT EXISTS`, `DROP ... IF EXISTS`, and idempotent patterns. Proper dependency ordering (drop triggers before functions).                                                   |
| 21  | ORM raw-query escape hatch review           | **Pass**    | No `.rpc()` calls with user-constructed SQL. All RPC calls use predefined functions. No raw SQL in client.                                                                                    |
| 22  | LIKE / regex input handling                 | **Pass**    | No `LIKE` or `ilike` queries with user input in client code. Supabase filters use `.eq()`, `.gte()`, `.in()`.                                                                                 |
| 23  | Query timeouts & resource guards            | **Fail**    | F15: No statement_timeout. F3/F4: Unbounded function execution.                                                                                                                               |
| 24  | Audit & monitoring depth                    | **Partial** | Booking audit exists but incomplete (F13). No monitoring for auth failures, RLS denials, or function errors.                                                                                  |
| 25  | PII in logs/metrics                         | **Pass**    | `console.error` calls log error objects, not user data. No PII in toast messages. Supabase URL/key logged in dev mode only (non-secret).                                                      |
| 26  | Indexing of sensitive data                  | **Pass**    | Index on `user_id` (UUID, not PII). Index on `display_name` may be questionable but is not a security issue. No index on email.                                                               |
| 27  | Service/account lifecycle                   | **Fail**    | F17: No validation on user metadata during signup. `ON DELETE CASCADE` handles user deletion for bookings/profiles, but no account deactivation flow exists.                                  |
| 28  | Caching layers                              | **Pass**    | Materialized view (`booking_summary_mv`) is the only cache. Properly secured via wrapper function `get_booking_summary()` with auth check. Direct access revoked from `anon`/`authenticated`. |
| 29  | Analytics/ETL exports                       | **N/A**     | No ETL pipelines or data export functionality in the codebase. Statistics are computed client-side or via database views.                                                                     |
