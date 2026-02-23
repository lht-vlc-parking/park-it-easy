# Authorization Implementation Security Audit

**Date:** 2026-02-23
**Scope:** All RLS policies, SECURITY DEFINER functions, client-side authorization, route protection
**Risk Score: 4.8 / 10** (Medium)

---

## Architecture

- **Single-tenant team app** — office parking for `@lht.dlh.de` employees
- **No RBAC system** — no admin role exists; all authenticated users have equal privileges
- **Authorization model:** Supabase RLS policies on PostgreSQL tables + `ProtectedRoute` in React
- **No backend server** — all authorization relies on Supabase RLS + client-side checks

---

## Findings

### F1 — No RBAC / Admin Role System

|                    |                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium                                                                                                                                                                                                        |
| **CWE**            | CWE-862 (Missing Authorization)                                                                                                                                                                               |
| **Evidence**       | All `supabase/migrations/*.sql` — no role tables, no admin checks                                                                                                                                             |
| **What**           | No role differentiation exists. All authenticated users have identical permissions. The `parking_spots` table has SELECT-only RLS — no INSERT/UPDATE/DELETE policies, so no one can manage spots via the API. |
| **Why it matters** | Admin operations (spot management, user management) have no authorized path. Future features will lack an authorization framework.                                                                            |

**Remediation:** Add a role system:

```sql
ALTER TABLE user_profiles ADD COLUMN role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin'));
-- Then use in RLS policies:
CREATE POLICY admin_manage_spots ON parking_spots
  FOR ALL TO authenticated
  USING ((SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'admin');
```

---

### F2 — `generate_recurring_bookings` Callable by Any Authenticated User

|                    |                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | High                                                                                                                                                                           |
| **CWE**            | CWE-269 (Improper Privilege Management)                                                                                                                                        |
| **Evidence**       | `supabase/migrations/20260103000004_v2_recurring_bookings.sql:78,135`                                                                                                          |
| **What**           | `SECURITY DEFINER` function that inserts bookings for ALL users' recurring patterns, granted `EXECUTE TO authenticated`. Any user can trigger booking generation for everyone. |
| **Why it matters** | Privilege escalation — a regular user can create bookings on behalf of other users.                                                                                            |

**PoC:**

```sql
SELECT generate_recurring_bookings();
-- Creates bookings for ALL active recurring booking patterns, regardless of caller
```

**Remediation:**

```sql
REVOKE EXECUTE ON FUNCTION generate_recurring_bookings() FROM authenticated;
-- Call via Supabase cron job or edge function with service_role key
```

---

### F3 — `refresh_booking_summary` DoS Vector

|              |                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | Medium                                                                                                                                                       |
| **CWE**      | CWE-400 (Uncontrolled Resource Consumption)                                                                                                                  |
| **Evidence** | `supabase/migrations/20260103000006_v2_statistics_views.sql:150,159`                                                                                         |
| **What**     | `SECURITY DEFINER` function that runs `REFRESH MATERIALIZED VIEW CONCURRENTLY`, granted to all authenticated users. Expensive DB operation callable at will. |

**Remediation:**

```sql
REVOKE EXECUTE ON FUNCTION refresh_booking_summary() FROM authenticated;
```

---

### F4 — `booking_availability` View Granted to `anon`

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Severity** | Low-Medium                                                      |
| **CWE**      | CWE-284 (Improper Access Control)                               |
| **Evidence** | `supabase/migrations/20260102000001_fix_security_issues.sql:22` |
| **What**     | Unauthenticated users can query aggregate booking data.         |

**Remediation:**

```sql
REVOKE SELECT ON public.booking_availability FROM anon;
```

---

### F5 — Client-Side Ownership Check by `user_name` String

|                    |                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Medium                                                                                                                                  |
| **CWE**            | CWE-639 (Authorization Bypass Through User-Controlled Key)                                                                              |
| **Evidence**       | `src/pages/Index.tsx:142,292`                                                                                                           |
| **What**           | `isMyBooking` is determined by matching `userName` string. Cancel button visibility depends on this client-side check.                  |
| **Why it matters** | Display names can collide. RLS enforces server-side delete by `user_id`, so actual deletion is safe, but UI shows wrong cancel buttons. |

**Remediation:**

```ts
const isMyBooking = booking.user_id === user.id;
```

---

### F6 — Missing `WITH CHECK` on Bookings UPDATE Policy

|              |                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | Medium                                                                                                                                                                                           |
| **CWE**      | CWE-863 (Incorrect Authorization)                                                                                                                                                                |
| **Evidence** | `supabase/migrations/20260102000002_fix_remaining_security_issues.sql:68-75`                                                                                                                     |
| **What**     | UPDATE policy has `USING` (can only update own rows) but no `WITH CHECK` (no constraint on what the new values can be). A user could potentially UPDATE `user_id` to transfer booking ownership. |

**Remediation:**

```sql
CREATE POLICY bookings_update ON bookings
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
```

---

### F7 — Email Domain Restriction is Client-Side Only

|              |                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                                             |
| **CWE**      | CWE-602 (Client-Side Enforcement of Server-Side Security)                                                        |
| **Evidence** | `src/pages/Auth.tsx:14,62`                                                                                       |
| **What**     | `@lht.dlh.de` domain restriction exists only in React UI. Supabase Auth API can be called directly to bypass it. |

**Remediation:** Configure email domain restriction in Supabase Auth dashboard settings, or add a database trigger on `auth.users` to reject non-corporate emails.

---

### F8 — `user_booking_stats` View Exposes All Users' Statistics

|                    |                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Low                                                                                                                                                 |
| **CWE**            | CWE-200 (Exposure of Sensitive Information)                                                                                                         |
| **Evidence**       | `supabase/migrations/20260103000006_v2_statistics_views.sql`                                                                                        |
| **What**           | View joins `user_profiles` (all profiles visible) with bookings. Any authenticated user sees ALL users' booking counts, departments, display names. |
| **Why it matters** | By design for team visibility, but worth noting. Contains no PII beyond name and department.                                                        |

---

### F9 — Nullable `user_id` on Bookings Creates Orphaned Data

|              |                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **Severity** | Low                                                                                                                                                     |
| **CWE**      | N/A                                                                                                                                                     |
| **Evidence** | `src/integrations/supabase/types.ts:24` — `user_id: string                                                                                              | null` |
| **What**     | Legacy rows may have NULL `user_id`. RLS `auth.uid() = user_id` evaluates to NULL (false), so these rows are invisible — not exploitable, but orphaned. |

---

## Pass/Fail Checklist

| Check                           | Status      | Notes                                                    |
| ------------------------------- | ----------- | -------------------------------------------------------- |
| RBAC implementation             | **FAIL**    | No role system exists                                    |
| BOLA/IDOR prevention            | **PASS**    | RLS enforces `user_id = auth.uid()` on all tables        |
| Privilege escalation prevention | **FAIL**    | `generate_recurring_bookings` callable by any user       |
| Multi-tenant isolation          | **N/A**     | Single-tenant app                                        |
| Route protection ordering       | **PASS**    | `ProtectedRoute` wraps all protected routes in `App.tsx` |
| Server-side authorization       | **PASS**    | RLS on all tables with proper policies                   |
| Client-side authorization       | **FAIL**    | Uses `user_name` string matching instead of `user_id`    |
| UPDATE WITH CHECK               | **FAIL**    | Missing on bookings update policy                        |
| Email domain enforcement        | **FAIL**    | Client-side only                                         |
| SECURITY DEFINER scope          | **FAIL**    | Two functions too broadly accessible                     |
| Anon role restrictions          | **PARTIAL** | Most tables deny anon; `booking_availability` view leaks |

---

## Top 5 Prioritized Fixes

| Priority | Fix                                                           | Severity | Effort |
| -------- | ------------------------------------------------------------- | -------- | ------ |
| **1**    | Revoke `generate_recurring_bookings` from authenticated users | High     | Low    |
| **2**    | Add `WITH CHECK` to bookings UPDATE policy                    | Medium   | Low    |
| **3**    | Enforce email domain restriction server-side                  | High     | Low    |
| **4**    | Use `user_id` instead of `user_name` for ownership checks     | Medium   | Low    |
| **5**    | Revoke `refresh_booking_summary` from authenticated users     | Medium   | Low    |
