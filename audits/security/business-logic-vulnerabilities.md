# Business Logic Vulnerabilities Audit

**Date:** 2026-02-23
**Auditor:** Security Audit (Automated)
**Scope:** Race conditions, resource manipulation, workflow bypass, time-based vulnerabilities (TOCTOU), integer overflow/underflow — adapted to parking-domain equivalents (double-booking, spot hoarding, waitlist manipulation)
**Application:** park-it-easy-office v2.3.3 (Vite/React 18/TypeScript 5.8 SPA + Supabase PostgreSQL)
**Risk Score: 6.4 / 10**

---

## Threat Model

| Threat Actor       | Capability                                                                                       | Motivation                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Authenticated user | Full Supabase JS SDK access, browser DevTools, direct REST/PostgREST calls with JWT              | Hoard parking spots, disrupt other users, impersonate          |
| Unauthenticated    | Supabase anon key (public in SPA bundle), direct REST calls                                      | Create rogue account (bypass email domain), data scrape        |
| Malicious insider  | Valid `@lht.dlh.de` credentials, knowledge of Supabase schema, ability to craft RPC calls        | Spot monopolization, waitlist manipulation, DoS                |
| Automated script   | Programmatic access via Supabase client library or raw HTTP, ability to send concurrent requests | Race condition exploitation, bulk booking, resource exhaustion |

---

## Findings

### BL1 — TOCTOU Race Condition in Booking Flow (Check-Then-Act)

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **CWE**            | CWE-367 (Time-of-Check Time-of-Use Race Condition)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Evidence**       | `src/components/BookingDialogWithValidation.tsx:70-106` (SELECT check), `src/pages/Index.tsx:84-91` (INSERT), `supabase/migrations/20260102000002_fix_remaining_security_issues.sql:83-138` (trigger)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **What**           | The booking flow performs a two-phase check-then-act: (1) Client SELECTs existing bookings to validate availability (`BookingDialogWithValidation.tsx:89-93`), then (2) a separate INSERT is issued (`Index.tsx:84-91`). Between these two operations, another user can insert a conflicting booking. The server-side trigger `check_car_booking_conflict()` provides a safety net, but the trigger itself performs `SELECT COUNT(*)` followed by conditional `RAISE EXCEPTION` within the same transaction — this is safe for single-row inserts but the trigger runs at `READ COMMITTED` isolation, meaning two concurrent INSERTs can both see zero conflicts and both succeed. |
| **Why it matters** | Two users booking the same car spot at the same time can both pass validation and both get their booking inserted, resulting in a double-booking. The trigger's `SELECT COUNT(*)` at `READ COMMITTED` isolation does not see uncommitted rows from concurrent transactions. The 4-motorcycle limit can similarly be exceeded (5+ motorcycles on the same slot/time).                                                                                                                                                                                                                                                                                                               |

**Exploitability:** Medium. Requires two near-simultaneous requests. Easily automated:

```js
// Two browser tabs or a script
const booking = {
  user_id: myId,
  user_name: 'User',
  date: '2026-03-01',
  duration: 'full',
  vehicle_type: 'car',
  spot_number: 84,
};
// Fire both simultaneously
Promise.all([
  supabase.from('bookings').insert(booking),
  supabase2.from('bookings').insert({ ...booking, user_id: otherUserId, user_name: 'Other' }),
]);
```

**Remediation:**

```sql
-- Option A: Add a UNIQUE partial index (prevents car double-booking at DB level)
CREATE UNIQUE INDEX idx_unique_car_booking
  ON public.bookings (spot_number, date, duration)
  WHERE vehicle_type = 'car';

-- For full-day blocking morning/afternoon and vice versa, use an EXCLUSION constraint
-- or upgrade the trigger to SERIALIZABLE isolation:

-- Option B: Set transaction isolation in the trigger
CREATE OR REPLACE FUNCTION public.check_car_booking_conflict()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  conflict_count integer;
BEGIN
  -- Advisory lock on (spot_number, date) to serialize concurrent inserts
  PERFORM pg_advisory_xact_lock(
    hashtext('booking_conflict'),
    hashtext(NEW.spot_number::text || NEW.date::text)
  );

  IF NEW.vehicle_type = 'car' THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'car'
      AND public.durations_overlap(duration, NEW.duration)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'This spot already has a car booking at that time';
    END IF;
  END IF;

  IF NEW.vehicle_type = 'motorcycle' THEN
    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'car'
      AND public.durations_overlap(duration, NEW.duration);
    IF conflict_count > 0 THEN
      RAISE EXCEPTION 'A car is booked for that time on this spot';
    END IF;

    SELECT COUNT(*) INTO conflict_count
    FROM public.bookings
    WHERE spot_number = NEW.spot_number
      AND date = NEW.date
      AND vehicle_type = 'motorcycle'
      AND public.durations_overlap(duration, NEW.duration)
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF conflict_count >= 4 THEN
      RAISE EXCEPTION 'Maximum 4 motorcycles allowed at the same time';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

---

### BL2 — User Identity Based on Mutable `user_name` String (IDOR)

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                                       |
| **CWE**            | CWE-639 (Authorization Bypass Through User-Controlled Key)                                                                                                                                                                                                                                                                                                                                                     |
| **Evidence**       | `src/components/BookingDialogWithValidation.tsx:67,74` (user_name for duplicate check), `src/pages/Index.tsx:141-142` (user_name for "my bookings"), `src/pages/Index.tsx:86` (user_name set from mutable metadata)                                                                                                                                                                                            |
| **What**           | The "one booking per user per date" duplicate check at `BookingDialogWithValidation.tsx:74` queries `.eq('user_name', userName)` where `userName` comes from `user.user_metadata?.user_name`. This metadata is client-controlled and mutable via `supabase.auth.updateUser({ data: { user_name: 'anything' } })`. The "my bookings" filter at `Index.tsx:142` also uses `userName` string comparison.          |
| **Why it matters** | (1) A user can bypass the duplicate-booking check by changing their `user_name` metadata, allowing unlimited bookings per date. (2) A user can see another user's cancel buttons by matching their `user_name`. (3) The `bookings.user_name` column is a freetext `TEXT NOT NULL` field set at insert time with no FK or validation — a user can impersonate anyone by inserting with `user_name: 'CEO Name'`. |

**Exploitability:** High. Single API call to change identity:

```js
// Step 1: Change display name to bypass duplicate check
await supabase.auth.updateUser({ data: { user_name: 'AltName' } });
// Step 2: Book same date again — the .eq('user_name', 'AltName') check finds no match
await supabase.from('bookings').insert({
  user_id: myId,
  user_name: 'AltName',
  date: '2026-03-01',
  duration: 'full',
  vehicle_type: 'car',
  spot_number: 84,
});
```

**Remediation:**

```tsx
// BookingDialogWithValidation.tsx:74 — use user_id instead of user_name
const { data: userBookings, error: userError } = await supabase
  .from('bookings')
  .select('*')
  .eq('user_id', user.id) // NOT .eq('user_name', userName)
  .eq('date', selectedDateStr);

// Index.tsx:142 — use user_id for "my bookings"
const myBookings = bookings.filter(b => b.user_id === user?.id);
```

```sql
-- Server-side: Add a UNIQUE constraint to enforce one booking per user per date
-- (or per user/date/spot if users can book both spots)
CREATE UNIQUE INDEX idx_one_booking_per_user_per_date
  ON public.bookings (user_id, date);

-- Validate user_name via trigger (see database-security.md F14)
```

---

### BL3 — Client-Side-Only Email Domain Restriction (Tenant Boundary Bypass)

|                    |                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Critical**                                                                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-602 (Client-Side Enforcement of Server-Side Security)                                                                                                                                                                                                                                                                            |
| **Evidence**       | `src/pages/Auth.tsx:14,53-66`                                                                                                                                                                                                                                                                                                        |
| **What**           | The `@lht.dlh.de` email domain restriction is enforced only by the `validateEmail()` function in `Auth.tsx:53-66`. The constant `ALLOWED_EMAIL_DOMAIN` at line 14 is a client-side-only check. There is no server-side enforcement: no Supabase Auth hook, no database trigger on `auth.users`, no RLS policy checking email domain. |
| **Why it matters** | The email domain restriction is the **only tenant/organization boundary** for the entire application. Bypassing it grants full authenticated access to all booking operations, all user data via views, and all SECURITY DEFINER functions. An attacker can create an account with any email via direct Supabase Auth API call.      |

**Exploitability:** Critical. Trivially bypassed:

```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://xxx.supabase.co', 'eyJ..anon-key..');
// Completely bypasses Auth.tsx validateEmail()
const { data, error } = await supabase.auth.signUp({
  email: 'attacker@evil.com',
  password: 'password123',
  options: { data: { user_name: 'Attacker' } },
});
// Now attacker is fully authenticated
```

**Remediation:**

```sql
-- Option A (recommended): Supabase Auth Hook (Edge Function)
-- Create supabase/functions/auth-hook/index.ts
-- See Supabase docs: https://supabase.com/docs/guides/auth/auth-hooks

-- Option B: Database trigger on auth.users
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

### BL4 — `generate_recurring_bookings()` Enables Spot Hoarding by Any User

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **CWE**            | CWE-269 (Improper Privilege Management) + CWE-770 (Allocation of Resources Without Limits)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Evidence**       | `supabase/migrations/20260103000004_v2_recurring_bookings.sql:75-135`                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **What**           | The `generate_recurring_bookings(days_ahead INTEGER)` function is `SECURITY DEFINER` (line 78), runs as `postgres`, and is explicitly granted to `authenticated` (line 135). It iterates over **ALL** users' recurring booking patterns and inserts bookings on their behalf. Any authenticated user can call `supabase.rpc('generate_recurring_bookings', { days_ahead: 99999 })` to generate thousands of bookings for all users across years.                                                                       |
| **Why it matters** | (1) **Spot hoarding**: A user who creates a recurring pattern first, then calls this function with a large `days_ahead`, locks out spots for all dates in that range before other users can book. (2) **Resource exhaustion**: The function performs unbounded INSERT loops — `days_ahead: 365000` iterates ~365,000 days per recurring pattern. (3) **Privilege escalation**: As SECURITY DEFINER, it bypasses RLS and inserts bookings for other users. (4) **No input validation**: No upper bound on `days_ahead`. |

**Exploitability:** High. Any authenticated user, single RPC call:

```js
// Step 1: Create a recurring booking pattern for every weekday
await supabase.from('recurring_bookings').insert({
  user_id: myId,
  spot_number: 84,
  vehicle_type: 'car',
  duration: 'full',
  pattern: 'daily',
  days_of_week: [1, 2, 3, 4, 5],
  start_date: '2026-02-23',
});
// Step 2: Generate bookings for the next 10 years
await supabase.rpc('generate_recurring_bookings', { days_ahead: 3650 });
// Result: ~2600 bookings created, spot 84 locked for a decade
```

**Remediation:**

```sql
-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.generate_recurring_bookings(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_bookings(INTEGER) TO service_role;

-- If must remain callable by authenticated users, add guards:
CREATE OR REPLACE FUNCTION public.generate_recurring_bookings(days_ahead INTEGER DEFAULT 14)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Only service_role can call this
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Only service_role can call this function';
  END IF;
  -- Hard cap
  IF days_ahead > 30 THEN
    days_ahead := 30;
  END IF;
  -- ... rest of function
END;
$$;
```

---

### BL5 — Missing `WITH CHECK` on Bookings UPDATE RLS Policy (Ownership Transfer)

|                    |                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                             |
| **CWE**            | CWE-863 (Incorrect Authorization)                                                                                                                                                                                                                                                                                                                                                                    |
| **Evidence**       | `supabase/migrations/20260102000002_fix_remaining_security_issues.sql:69-75`                                                                                                                                                                                                                                                                                                                         |
| **What**           | The UPDATE policy on `bookings` at line 69-75 has `USING (user_id = (SELECT auth.uid()))` but no `WITH CHECK` clause. The `USING` clause controls which rows a user can see for update, but `WITH CHECK` controls what the new row values can be. Without it, a user can UPDATE their own booking to change `user_id` to another user's UUID, effectively transferring or forging booking ownership. |
| **Why it matters** | Combined with `user_booking_stats` view which exposes all users' `user_id` values, an attacker can: (1) create a booking, (2) update its `user_id` to a victim's UUID, making the booking appear as the victim's. This corrupts audit trails and booking ownership. It also allows bypassing the "one booking per user per date" client-side check by making it look like another user's booking.    |

**Exploitability:** Medium. Requires knowledge of another user's UUID (available from `user_booking_stats` view):

```js
// Get victim's user_id from public stats view
const { data: stats } = await supabase.from('user_booking_stats').select('user_id, display_name');
const victimId = stats.find(s => s.display_name === 'Target User').user_id;

// Transfer my booking to victim
await supabase.from('bookings').update({ user_id: victimId }).eq('id', myBookingId);
```

**Remediation:**

```sql
DROP POLICY IF EXISTS "Users can update their own bookings" ON public.bookings;
CREATE POLICY "Users can update their own bookings"
  ON public.bookings
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));
```

---

### BL6 — Waitlist Position Assignment Race Condition (Duplicate Positions)

|                    |                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                     |
| **CWE**            | CWE-367 (Time-of-Check Time-of-Use Race Condition)                                                                                                                                                                                                                                                                                                                                             |
| **Evidence**       | `supabase/migrations/20260103000005_v2_waitlist.sql:63-79`                                                                                                                                                                                                                                                                                                                                     |
| **What**           | The `assign_waitlist_position()` trigger (lines 63-79) calculates the next position with `SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position`. This SELECT runs at `READ COMMITTED` isolation and does not lock the rows it reads. Two concurrent INSERT operations can both see the same `MAX(position)` value and both assign the same position number, violating FIFO queue semantics. |
| **Why it matters** | Duplicate positions corrupt the waitlist order. When `notify_waitlist_on_cancellation()` runs `ORDER BY position ASC LIMIT 1`, it non-deterministically picks one of the tied entries. The user who should have been first in line may be skipped.                                                                                                                                             |

**Exploitability:** Low. Requires near-simultaneous waitlist joins for the same spot/date. More likely to occur naturally than as a deliberate attack.

**Remediation:**

```sql
CREATE OR REPLACE FUNCTION public.assign_waitlist_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Use advisory lock to serialize position assignment per (spot, date, duration)
  PERFORM pg_advisory_xact_lock(
    hashtext('waitlist_position'),
    hashtext(NEW.spot_number::text || NEW.date::text || NEW.duration::text)
  );

  SELECT COALESCE(MAX(position), 0) + 1 INTO NEW.position
  FROM public.booking_waitlist
  WHERE spot_number = NEW.spot_number
    AND date = NEW.date
    AND duration = NEW.duration
    AND status = 'waiting';

  RETURN NEW;
END;
$$;
```

---

### BL7 — No Server-Side Enforcement of One-Booking-Per-User-Per-Date Limit

|                    |                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                              |
| **CWE**            | CWE-799 (Improper Control of Interaction Frequency)                                                                                                                                                                                                                                                                                                                                   |
| **Evidence**       | `src/components/BookingDialogWithValidation.tsx:70-86` (client-side check), `supabase/migrations/20251009223514_5a158dda-acc7-4b46-a082-d2ebf10da4f3.sql:6-14` (table definition — no unique constraint on `user_id + date`)                                                                                                                                                          |
| **What**           | The "one booking per user per date" business rule is enforced only client-side in `BookingDialogWithValidation.tsx:70-86`, and it uses `user_name` (not `user_id`) for the check (see BL2). There is no database UNIQUE constraint, no trigger, and no RLS policy enforcing this limit. A user can directly call the Supabase INSERT API multiple times to create unlimited bookings. |
| **Why it matters** | A single user can monopolize both parking spots on any date by inserting multiple bookings, effectively denying service to all other users. Combined with BL4 (recurring bookings), this can be automated across many dates.                                                                                                                                                          |

**Exploitability:** High. Direct API calls bypass all client-side validation:

```js
// Book both spots, full day, same date
for (const spot of [84, 85]) {
  await supabase.from('bookings').insert({
    user_id: myId,
    user_name: 'Me',
    date: '2026-03-01',
    duration: 'full',
    vehicle_type: 'car',
    spot_number: spot,
  });
}
// User now occupies 100% of parking capacity for that day
```

**Remediation:**

```sql
-- Add a unique constraint to enforce at DB level
-- Option A: One booking per user per date (strict)
CREATE UNIQUE INDEX idx_one_booking_per_user_per_date
  ON public.bookings (user_id, date);

-- Option B: One booking per user per date per spot (allows booking both spots)
CREATE UNIQUE INDEX idx_one_booking_per_user_per_date_spot
  ON public.bookings (user_id, date, spot_number);

-- Also update the trigger to check user_id:
-- In check_car_booking_conflict(), add:
DECLARE user_booking_count integer;
BEGIN
  SELECT COUNT(*) INTO user_booking_count
  FROM public.bookings
  WHERE user_id = NEW.user_id AND date = NEW.date
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
  IF user_booking_count > 0 THEN
    RAISE EXCEPTION 'User already has a booking on this date';
  END IF;
  -- ... existing conflict checks
```

---

### BL8 — No Server-Side Validation for Past-Date Bookings

|                    |                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                            |
| **CWE**            | CWE-20 (Improper Input Validation) + CWE-602 (Client-Side Enforcement of Server-Side Security)                                                                                                                                                                                                                                        |
| **Evidence**       | `src/services/bookingService.ts:86-96` (client-side past-date check), `src/components/BookingDialogWithValidation.tsx:211` (calendar disables past dates), `supabase/migrations/20260102000002_fix_remaining_security_issues.sql:83-138` (trigger — no date validation)                                                               |
| **What**           | Past-date booking prevention exists only client-side: `bookingService.ts:87-96` checks `if (bookingDate < today)` and the calendar UI disables past dates. The server-side trigger `check_car_booking_conflict()` validates overlap conflicts but never checks if `NEW.date < CURRENT_DATE`. No CHECK constraint on the table either. |
| **Why it matters** | A user can insert bookings for past dates via direct API, polluting statistics (which include all historical data), corrupting fairness scores, and inflating personal booking counts in `user_booking_stats`.                                                                                                                        |

**Exploitability:** Medium. Direct API call:

```js
await supabase.from('bookings').insert({
  user_id: myId,
  user_name: 'Me',
  date: '2025-01-01', // past date
  duration: 'full',
  vehicle_type: 'car',
  spot_number: 84,
});
// Statistics and fairness calculations now include this fabricated historical booking
```

**Remediation:**

```sql
-- Option A: CHECK constraint on table
ALTER TABLE public.bookings
ADD CONSTRAINT booking_date_not_past CHECK (date >= CURRENT_DATE);

-- Option B: Add to the existing trigger
-- In check_car_booking_conflict():
IF NEW.date < CURRENT_DATE THEN
  RAISE EXCEPTION 'Cannot create bookings for past dates';
END IF;
```

---

### BL9 — `expire_waitlist_notifications()` Callable by Any User (Queue Manipulation)

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **CWE**            | CWE-269 (Improper Privilege Management)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Evidence**       | `supabase/migrations/20260103000005_v2_waitlist.sql:126-151`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **What**           | The `expire_waitlist_notifications()` function is `SECURITY DEFINER` (line 129) and has no explicit REVOKE, making it callable by both `anon` and `authenticated` (Supabase default: functions are executable by `public`). It expires ALL notified waitlist entries where `expires_at < now()` and ALL waiting entries for past dates — affecting all users, not just the caller.                                                                                                   |
| **Why it matters** | An attacker can call this function repeatedly to prematurely expire other users' waitlist notifications. While it only expires entries past their `expires_at` timestamp, a user who has just been notified (with a 30-minute window) could have their notification expired by a concurrent call if there's any clock skew or if the attacker manipulates timing. More importantly, calling this as `anon` (unauthenticated) exposes an unnecessary SECURITY DEFINER execution path. |

**Exploitability:** Low-Medium. The function is time-gated by `expires_at < now()`, limiting the attack window. But repeated calls waste resources and the `anon` access is unnecessary.

**Remediation:**

```sql
REVOKE EXECUTE ON FUNCTION public.expire_waitlist_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_notifications() TO service_role;
-- Call from a Supabase cron job every 5 minutes
```

---

### BL10 — `refresh_booking_summary()` Denial of Service via Materialized View Refresh

|                    |                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                             |
| **CWE**            | CWE-400 (Uncontrolled Resource Consumption)                                                                                                                                                                                                                                                                                                                            |
| **Evidence**       | `supabase/migrations/20260103000006_v2_statistics_views.sql:147-159`                                                                                                                                                                                                                                                                                                   |
| **What**           | `refresh_booking_summary()` is `SECURITY DEFINER` (line 150), granted to `authenticated` (line 159), and executes `REFRESH MATERIALIZED VIEW CONCURRENTLY`. This acquires an `EXCLUSIVE` lock on `booking_summary_mv` and performs a full table scan of `bookings`. Any authenticated user can call it in a tight loop, causing CPU/IO exhaustion and lock contention. |
| **Why it matters** | Even moderate call frequency (e.g., 10 calls/second) can degrade database performance for all users. The `CONCURRENTLY` keyword means the view remains readable during refresh, but the refresh itself is expensive and each call recomputes all aggregate statistics from scratch.                                                                                    |

**Exploitability:** High ease, medium impact:

```js
for (let i = 0; i < 100; i++) {
  supabase.rpc('refresh_booking_summary'); // No await — fire and forget
}
```

**Remediation:**

```sql
REVOKE EXECUTE ON FUNCTION public.refresh_booking_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_booking_summary() TO service_role;
-- Refresh via cron: SELECT cron.schedule('refresh-summary', '*/5 * * * *', 'SELECT refresh_booking_summary()');
```

---

### BL11 — `notify_waitlist_on_cancellation()` Can Be Triggered by Deleting Own Booking Strategically

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **CWE**            | CWE-441 (Unintended Proxy or Intermediary)                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Evidence**       | `supabase/migrations/20260103000005_v2_waitlist.sql:86-119,121-123`                                                                                                                                                                                                                                                                                                                                                                                |
| **What**           | The `notify_waitlist_on_cancellation()` trigger fires `AFTER DELETE` on `bookings` (line 121-123) and runs as `SECURITY DEFINER`. It updates **another user's** waitlist entry to `status = 'notified'` with a 30-minute expiry. A user can create a booking, wait for waitlist entries to accumulate, then delete it to trigger notifications — burning through the 30-minute windows of waitlisted users who may not be ready to claim the spot. |
| **Why it matters** | While this is partially by design (cancel → notify next person), the 30-minute window is non-configurable and a strategic user could repeatedly create-and-cancel bookings to burn through the entire waitlist, eventually clearing all competitors before making their real booking. The waitlist has no protection against this cycling attack.                                                                                                  |

**Exploitability:** Low. Requires patience and the cycling is slow (30 min per waitlist entry). Primarily a design weakness rather than a high-impact exploit.

**Remediation:**

```sql
-- Add rate limiting: prevent re-booking the same spot within 30 minutes of cancellation
-- Option: Track cancellation time and block immediate rebooking
CREATE OR REPLACE FUNCTION public.check_recent_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  recent_cancel TIMESTAMPTZ;
BEGIN
  SELECT MAX(ba.created_at) INTO recent_cancel
  FROM public.booking_audit ba
  WHERE ba.user_id = NEW.user_id
    AND ba.action = 'cancelled'
    AND (ba.old_data->>'spot_number')::int = NEW.spot_number
    AND (ba.old_data->>'date') = NEW.date::text
    AND ba.created_at > now() - INTERVAL '30 minutes';

  IF recent_cancel IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot rebook a spot within 30 minutes of cancellation (waitlist priority)';
  END IF;
  RETURN NEW;
END;
$$;
```

---

### BL12 — `recurring_bookings` Table Missing `spot_number` CHECK Constraint

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **CWE**            | CWE-20 (Improper Input Validation)                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Evidence**       | `supabase/migrations/20260103000004_v2_recurring_bookings.sql:8-29` (no CHECK on spot_number), `supabase/migrations/20260103000005_v2_waitlist.sql:8-23` (no CHECK on spot_number), cf. `supabase/migrations/20251009223514_5a158dda-acc7-4b46-a082-d2ebf10da4f3.sql:12` (`CHECK (spot_number IN (84, 85))` on bookings)                                                                                                                     |
| **What**           | The `bookings` table has `CHECK (spot_number IN (84, 85))` but neither `recurring_bookings` nor `booking_waitlist` have this constraint. A user can create a recurring pattern or waitlist entry for an arbitrary spot number (e.g., 999). When `generate_recurring_bookings()` processes such a pattern, the INSERT into `bookings` will fail due to the bookings CHECK constraint, but the recurring pattern persists in an invalid state. |
| **Why it matters** | Invalid `spot_number` values in `recurring_bookings` cause silent failures during generation. Invalid waitlist entries for non-existent spots waste queue positions and will never be fulfilled.                                                                                                                                                                                                                                             |

**Remediation:**

```sql
ALTER TABLE public.recurring_bookings
ADD CONSTRAINT valid_spot_number CHECK (spot_number IN (84, 85));

ALTER TABLE public.booking_waitlist
ADD CONSTRAINT valid_spot_number CHECK (spot_number IN (84, 85));
```

---

### BL13 — Statistics Division-by-Zero and NaN Propagation

|                    |                                                                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                   |
| **CWE**            | CWE-369 (Divide By Zero)                                                                                                                                                                                                                                                                  |
| **Evidence**       | `src/pages/Statistics.tsx:569` (client-side division), `supabase/migrations/20260103000006_v2_statistics_views.sql:84` (fairness score uses `std_dev / avg_bookings * 100`)                                                                                                               |
| **What**           | In `Statistics.tsx:569`, `(carBookings / totalBookings) * 100` produces `NaN` when `totalBookings` is 0. The `                                                                                                                                                                            |     | 0`fallback handles`NaN`for display but upstream calculations using the`NaN`value may produce unexpected results. The SQL`booking_fairness`view at line 84 handles this with a`CASE WHEN avg_bookings = 0`guard, but`daily_occupancy_stats`at line 51 divides by the literal`2` (max_spots), which is safe but hardcoded and will break if spot count changes. |
| **Why it matters** | NaN propagation in statistics can corrupt derived calculations (e.g., chart rendering, trend analysis). While not a security vulnerability per se, an attacker who bulk-deletes their bookings or creates edge-case data can cause the statistics page to display misleading information. |

**Exploitability:** Low. Edge case rather than deliberate exploit.

**Remediation:**

```tsx
// Statistics.tsx — guard all divisions
const carPercentage = totalBookings > 0 ? (carBookings / totalBookings) * 100 : 0;
```

---

## Summary Risk Score: 6.4/10

The application has a well-structured database layer with RLS policies, SECURITY INVOKER views, and server-side conflict checking triggers. However, significant business logic vulnerabilities exist at the boundary between client-side validation and server-side enforcement:

- **Critical gap (BL3):** The tenant boundary (`@lht.dlh.de` email restriction) exists only in client-side JavaScript — any external party can create an account.
- **Race conditions (BL1, BL6):** The booking conflict trigger runs at `READ COMMITTED` isolation without advisory locks, allowing double-booking under concurrent load. The waitlist position assignment has the same issue.
- **Identity confusion (BL2, BL7):** The mutable `user_name` string is used for identity matching and business rule enforcement instead of the immutable `user_id`. No server-side constraint enforces the one-booking-per-user-per-date rule.
- **Overprivileged functions (BL4, BL9, BL10):** Three SECURITY DEFINER functions are callable by any authenticated user, enabling spot hoarding, waitlist manipulation, and resource exhaustion.
- **Authorization gap (BL5):** The missing `WITH CHECK` on the UPDATE policy allows booking ownership transfer.

The combination of BL2 + BL7 is particularly dangerous: a user can change their `user_name`, bypass the duplicate check, and create unlimited bookings per date with no server-side enforcement.

## Top 5 Prioritized Fixes

1. **BL3 — Server-side email domain enforcement.** This is the most critical vulnerability. Without it, anyone on the internet can create an account and access all operations. Implement a Supabase Auth hook or `auth.users` BEFORE INSERT trigger immediately.

2. **BL7 + BL2 — Add `UNIQUE(user_id, date)` constraint and switch all identity checks to `user_id`.** This simultaneously fixes the unlimited-bookings-per-date exploit and the `user_name`-based identity confusion. Single migration, high impact.

3. **BL4 — Revoke `generate_recurring_bookings` from `authenticated`.** Any user can generate thousands of bookings for all users. One-line SQL fix: `REVOKE EXECUTE ... FROM authenticated`.

4. **BL5 — Add `WITH CHECK` to bookings UPDATE policy.** Prevents booking ownership transfer. One-line SQL fix.

5. **BL1 — Add advisory locks to `check_car_booking_conflict()` trigger.** Prevents double-booking race condition. Alternatively, add a UNIQUE partial index for car bookings.

---

## Checklist (Pass/Fail/N/A)

| #   | Item                                                       | Status      | Notes                                                                                                                                                                                                |
| --- | ---------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------- |
| 1   | Race condition protection on booking creation              | **Fail**    | BL1: `check_car_booking_conflict()` trigger runs at READ COMMITTED without advisory locks. Concurrent inserts can both pass the COUNT check.                                                         |
| 2   | Race condition protection on waitlist position assignment  | **Fail**    | BL6: `assign_waitlist_position()` uses `MAX(position) + 1` without locking. Concurrent inserts get duplicate positions.                                                                              |
| 3   | Server-side booking limit per user per date                | **Fail**    | BL7: No UNIQUE constraint on `(user_id, date)`. No trigger enforcement. Client-side only check uses `user_name` (BL2).                                                                               |
| 4   | Identity matching uses immutable identifiers               | **Fail**    | BL2: `user_name` string matching used for duplicate check and "my bookings" filter instead of `user_id`.                                                                                             |
| 5   | Tenant boundary enforced server-side                       | **Fail**    | BL3: Email domain restriction is client-side JavaScript only. No Auth hook, trigger, or RLS policy.                                                                                                  |
| 6   | SECURITY DEFINER functions restricted to appropriate roles | **Fail**    | BL4, BL9, BL10: `generate_recurring_bookings`, `expire_waitlist_notifications`, `refresh_booking_summary` all callable by `authenticated` or `public`.                                               |
| 7   | RLS UPDATE policies include WITH CHECK                     | **Fail**    | BL5: Bookings UPDATE policy has USING but no WITH CHECK, allowing `user_id` column modification.                                                                                                     |
| 8   | Past-date booking prevention server-side                   | **Fail**    | BL8: No CHECK constraint or trigger validation for `date >= CURRENT_DATE`.                                                                                                                           |
| 9   | Consistent CHECK constraints across related tables         | **Fail**    | BL12: `spot_number IN (84, 85)` exists on `bookings` but not on `recurring_bookings` or `booking_waitlist`.                                                                                          |
| 10  | Waitlist cycling protection                                | **Fail**    | BL11: No cooldown or rate limit on cancel-and-rebook to prevent burning through waitlist entries.                                                                                                    |
| 11  | Input bounds on RPC function parameters                    | **Fail**    | BL4: `days_ahead` parameter has no upper bound. Can be set to any integer.                                                                                                                           |
| 12  | Division-by-zero guards in statistics                      | **Partial** | BL13: SQL views handle zero divisors. Client-side `Statistics.tsx` uses `                                                                                                                            |     | 0` fallback but NaN can propagate in intermediate calculations. |
| 13  | Trigger conflict check uses appropriate isolation          | **Fail**    | BL1: `check_car_booking_conflict()` relies on `SELECT COUNT(*)` at READ COMMITTED. No advisory lock or SERIALIZABLE.                                                                                 |
| 14  | Booking INSERT validates required business invariants      | **Partial** | Conflict checking exists via trigger (overlap, motorcycle limit). Missing: per-user-per-date limit, past-date check, `user_name` validation.                                                         |
| 15  | Waitlist notification window is tamper-resistant           | **Pass**    | The 30-minute `expires_at` is set server-side in the SECURITY DEFINER trigger. Users cannot modify it directly (RLS UPDATE only allows own entries, and `expires_at` is set by trigger, not client). |
| 16  | Recurring booking generation is access-controlled          | **Fail**    | BL4: Granted to all authenticated users. Should be service_role only.                                                                                                                                |
| 17  | Statistics views do not enable privilege escalation        | **Partial** | `user_booking_stats` exposes `user_id` UUIDs which, combined with BL5, enables booking ownership transfer. Otherwise views are read-only and appropriate.                                            |
| 18  | Client-side validation is defense-in-depth only            | **Fail**    | BL3, BL7, BL8: Multiple business rules enforced only client-side with no server-side backup. Client validation is the primary (only) enforcement layer.                                              |
