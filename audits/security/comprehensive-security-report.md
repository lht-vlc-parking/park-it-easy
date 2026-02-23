# Comprehensive Security Report

**Application:** park-it-easy-office v2.4.1 _(originally audited at v2.3.3)_
**Original Audit Date:** 2026-02-23
**Last Updated:** 2026-02-23 (post-remediation re-audit at v2.4.1)
**Auditor:** Automated Security Audit (Consolidated) + 6 parallel re-audit agents
**Scope:** Full-stack security audit — Vite/React 18/TypeScript 5.8 SPA, Supabase (PostgreSQL + Auth + RLS), GitHub Pages hosting, GitHub Actions CI/CD
**Domain:** Parking management system for Lufthansa Technik office (`@lht.dlh.de` domain)
**Delta Report:** See `audits/v2.4.1-delta-report.md` for full v2.3.3 → v2.4.1 comparison

---

## Executive Summary

This report consolidates findings from **11 individual security audits** covering authentication, authorization, input validation, database security, session/cookie management, secrets management, API/infrastructure, business logic, file handling, and logging/monitoring, plus 2 code quality audits.

> **v2.4.1 UPDATE:** Phase 1-2 remediation resolved **15 findings** (5 High, 7 Medium, 3 Low). The re-audit also identified **12 new findings** (1 High, 4 Medium, 7 Low). The delta report contains full details.

**Overall Risk Score: ~~5.1~~ → 3.8 / 10** (weighted average across all audit domains)

The application has a **single critical vulnerability** — client-side-only email domain enforcement — that undermines the entire tenant boundary. ~~Six~~ Three remaining high-severity issues affect observability, plus one new high-severity finding (admin role check uses user-writable metadata). The codebase benefits from strong CI/CD security practices (SLSA L3, Sigstore, SBOM, Grype), properly configured RLS on all tables, and no committed secrets. ~~The combination of client-only business rule enforcement, identity based on mutable strings, and zero operational monitoring creates significant risk.~~ Phase 1-2 fixes addressed client-only enforcement gaps (CSP, UNIQUE constraints, WITH CHECK, past-date check, error mapping, admin function restrictions). The remaining risk is concentrated in the **logging/monitoring cluster** (H7-H9, Phase 3) and the **critical tenant boundary** (C1, requires dashboard config).

**Key Statistics (v2.4.1):**

- **1 Critical** vulnerability (requires Supabase Dashboard config — cannot fix via code)
- **5 High** vulnerabilities (3 original + 1 new + 1 partially overlapping)
- **~16 Medium** vulnerabilities (~12 original still open + 4 new)
- **~16 Low** vulnerabilities (~10 original still open + 6 new from deeper analysis)
- **15 findings resolved** in v2.4.0-v2.4.1
- **12 new findings** discovered in re-audit

**Positive Findings:**

- RLS enabled on all tables with `auth.uid()` checks
- Views migrated to `security_invoker = true`
- No SQL injection vectors (PostgREST parameterized queries)
- No secrets in git; `.env` properly gitignored
- Strong CI/CD pipeline: SLSA L3, Sigstore provenance, SBOM generation, Grype vulnerability scanning
- No file upload/handling attack surface
- Dependencies clean — zero known CVEs (all 6 Dependabot PRs merged in v2.4.1)
- Passwords and tokens not logged anywhere
- **(NEW in v2.4.1)** Content Security Policy (CSP) meta tag deployed
- **(NEW in v2.4.1)** Server-side UNIQUE(user_id, date) constraint prevents duplicate bookings and race conditions
- **(NEW in v2.4.1)** WITH CHECK on UPDATE RLS policy prevents booking ownership transfer
- **(NEW in v2.4.1)** Admin-only restrictions on SECURITY DEFINER functions
- **(NEW in v2.4.1)** User-facing error messages sanitized (no raw Supabase errors in toasts)
- **(NEW in v2.4.1)** 12-character password policy with complexity requirements
- **(NEW in v2.4.1)** Display name sanitization at signup (Unicode-safe)

---

## Table of Contents

1. [Vulnerability Summary by Severity](#vulnerability-summary-by-severity)
2. [Critical Vulnerabilities](#critical-vulnerabilities)
3. [High Vulnerabilities](#high-vulnerabilities)
4. [Medium Vulnerabilities](#medium-vulnerabilities)
5. [Low Vulnerabilities](#low-vulnerabilities)
6. [OWASP Top 10 (2021) Mapping](#owasp-top-10-2021-mapping)
7. [GDPR Compliance Assessment](#gdpr-compliance-assessment)
8. [Remediation Roadmap](#remediation-roadmap)
9. [Security Recommendations](#security-recommendations)
10. [Testing Guide](#testing-guide)
11. [Risk Score Summary](#risk-score-summary)

---

## Vulnerability Summary by Severity

| Severity | v2.3.3 Count | v2.4.1 Count | Resolved | New | Net Change |
| -------- | ------------ | ------------ | -------- | --- | ---------- |
| Critical | 1            | 1            | 0        | 0   | —          |
| High     | 9            | 5            | 5        | 1   | ▼ 4        |
| Medium   | ~19          | ~16          | 7        | 4   | ▼ 3        |
| Low      | ~12          | ~16          | 3        | 7   | ▲ 4\*      |

_\*Low count increased due to deeper re-audit coverage, not regression._

---

## Critical Vulnerabilities

### C1 — Client-Side-Only Email Domain Restriction (Tenant Boundary Bypass)

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Requires Supabase Dashboard configuration (Auth Hook or email domain restriction setting). Cannot be fixed via code/migrations.

| Field              | Detail                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| **ID**             | C1                                                                                                                  |
| **Severity**       | **CRITICAL**                                                                                                        |
| **CVSS (est.)**    | 9.1                                                                                                                 |
| **CWE**            | CWE-602 (Client-Side Enforcement of Server-Side Security), CWE-284 (Improper Access Control)                        |
| **OWASP**          | A01:2021 — Broken Access Control                                                                                    |
| **Source Reports** | initial-security-analysis F1, authorization F7, database-security F6, business-logic BL3, api-and-infrastructure F9 |
| **Evidence**       | `src/pages/Auth.tsx:14,53-66`                                                                                       |

**Description:**
The `@lht.dlh.de` email domain check exists **only** in the React client (`Auth.tsx:53-66`). There is no server-side enforcement — no Supabase Auth hook, no database constraint, no RLS policy filtering by email domain. Any external party can call `supabase.auth.signUp({ email: 'attacker@evil.com', password: '...' })` directly using the publicly exposed Supabase URL and anon key, bypassing the client entirely.

This is the application's **sole tenant boundary**. Bypassing it grants full authenticated access to all parking data, bookings, and user information.

**Proof of Concept:**

```javascript
// From browser console on any page, or from any HTTP client:
const { createClient } = supabase;
const client = createClient('https://<project>.supabase.co', '<anon-key-from-page-source>');
const { data, error } = await client.auth.signUp({
  email: 'attacker@gmail.com',
  password: 'password123',
});
// Result: account created, full access granted
```

**Remediation (Server-Side — Required):**

Option A — Supabase Auth Hook (recommended):

```sql
-- In Supabase Dashboard > Authentication > Hooks > Before Sign Up
CREATE OR REPLACE FUNCTION public.enforce_email_domain()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email NOT LIKE '%@lht.dlh.de' THEN
    RAISE EXCEPTION 'Registration restricted to @lht.dlh.de email addresses';
  END IF;
  RETURN NEW;
END;
$$;

-- Or via Supabase Edge Function hook:
-- POST /functions/v1/auth-hook → validate email domain → return 403
```

Option B — RLS Policy (defense-in-depth, apply to ALL tables):

```sql
-- Add to every table's SELECT/INSERT/UPDATE/DELETE policies:
AND auth.jwt()->>'email' LIKE '%@lht.dlh.de'
```

Option C — Supabase Dashboard: Authentication > Settings > Restrict email domain to `lht.dlh.de`.

**Priority:** Immediate. This must be the first fix deployed.

---

## High Vulnerabilities

### H1 — `generate_recurring_bookings()` SECURITY DEFINER Callable by Any Authenticated User

> **v2.4.1 STATUS: ✅ RESOLVED** — Added admin role check + 90-day `p_days_ahead` limit in `supabase/migrations/20260223000002_phase2_restrict_functions.sql`. **⚠️ However, see NEW-H1:** the admin check uses `raw_user_meta_data` which is user-writable — privilege escalation still possible.

| Field              | Detail                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| **ID**             | H1                                                                                    |
| **Severity**       | **HIGH**                                                                              |
| **CWE**            | CWE-269 (Improper Privilege Management)                                               |
| **OWASP**          | A01:2021 — Broken Access Control                                                      |
| **Source Reports** | authorization F2, database-security F3, business-logic BL4, api-and-infrastructure F3 |
| **Evidence**       | `supabase/migrations/20260103000001_v2_recurring_bookings.sql`                        |

**Description:**
The `generate_recurring_bookings(p_days_ahead INTEGER DEFAULT 30)` function runs as `SECURITY DEFINER` (superuser context) and can be called by any authenticated user via `supabase.rpc('generate_recurring_bookings', { p_days_ahead: 9999 })`. It bulk-inserts bookings for **all** recurring booking rules across **all** users with no authorization check on the caller. An attacker can flood the bookings table or generate bookings on behalf of other users.

**Remediation:**

```sql
-- Add caller check at the top of the function:
IF NOT EXISTS (
  SELECT 1 FROM auth.users
  WHERE id = auth.uid()
  AND email LIKE '%@lht.dlh.de'
  AND raw_user_meta_data->>'role' = 'admin'
) THEN
  RAISE EXCEPTION 'Only admins can generate recurring bookings';
END IF;

-- Also add: IF p_days_ahead > 90 THEN RAISE EXCEPTION '...'; END IF;
-- Consider: Move to a Supabase Edge Function or cron job instead of user-callable RPC.
```

---

### H2 — Missing `WITH CHECK` on Bookings UPDATE RLS Policy

> **v2.4.1 STATUS: ✅ RESOLVED** — `WITH CHECK (auth.uid() = user_id)` added in `supabase/migrations/20260223000001_phase1_security_fixes.sql`.

| Field              | Detail                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| **ID**             | H2                                                                           |
| **Severity**       | **HIGH**                                                                     |
| **CWE**            | CWE-863 (Incorrect Authorization)                                            |
| **OWASP**          | A01:2021 — Broken Access Control                                             |
| **Source Reports** | authorization F6, database-security F1, business-logic BL5                   |
| **Evidence**       | `supabase/migrations/20260102000002_fix_remaining_security_issues.sql:69-75` |

**Description:**
The UPDATE policy on the `bookings` table uses `USING (auth.uid() = user_id)` but has **no `WITH CHECK` clause**. This means a user who can update their own booking can change the `user_id` column to any other user's ID, effectively transferring ownership of the booking. The `USING` clause only controls _which_ rows can be updated; `WITH CHECK` controls _what values_ the row can be updated to.

**Remediation:**

```sql
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;
CREATE POLICY "Users can update own bookings"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);  -- Prevent user_id reassignment
```

---

### H3 — Identity Based on Mutable `user_name` String Instead of `user_id`

> **v2.4.1 STATUS: ✅ RESOLVED** — `UNIQUE(user_id, date)` constraint added. Server-side identity enforcement no longer depends on `user_name`. Client-side code in `BookingDialogWithValidation.tsx` still uses `user_name` for duplicate check (see NEW-M3), but the server constraint is the authoritative control.

| Field              | Detail                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **ID**             | H3                                                                                                                |
| **Severity**       | **HIGH**                                                                                                          |
| **CWE**            | CWE-602 (Client-Side Enforcement of Server-Side Security), CWE-284 (Improper Access Control)                      |
| **OWASP**          | A01:2021 — Broken Access Control                                                                                  |
| **Source Reports** | initial-security-analysis F3, authorization F5, input-validation F4, database-security F2/F14, business-logic BL2 |
| **Evidence**       | `src/pages/Index.tsx` (booking creation), `src/services/bookingService.ts` (duplicate check), multiple hooks      |

**Description:**
Booking ownership and the duplicate-booking check rely on the `user_name` text column (populated from `user_metadata.full_name`) rather than `user_id` (the immutable `auth.uid()` UUID). A user who changes their display name can:

1. Bypass the "one booking per day" check (the old-name bookings don't match).
2. Appear as a different user in booking lists.
3. Claim other users' bookings if name collision occurs.

**Remediation:**

- Migrate all identity checks from `user_name` to `user_id`.
- Add a server-side unique constraint: `UNIQUE(user_id, date)` on the `bookings` table.
- Keep `user_name` only as a denormalized display field.

```sql
-- Add the correct constraint:
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_user_date_unique UNIQUE (user_id, date);
```

---

### H4 — No Server-Side One-Booking-Per-User-Per-Date Constraint

> **v2.4.1 STATUS: ✅ RESOLVED** — `UNIQUE(user_id, date)` constraint added in `supabase/migrations/20260223000001_phase1_security_fixes.sql`.

| Field              | Detail                                                    |
| ------------------ | --------------------------------------------------------- |
| **ID**             | H4                                                        |
| **Severity**       | **HIGH**                                                  |
| **CWE**            | CWE-602 (Client-Side Enforcement of Server-Side Security) |
| **OWASP**          | A01:2021 — Broken Access Control                          |
| **Source Reports** | business-logic BL7                                        |
| **Evidence**       | `src/services/bookingService.ts` (client-side check only) |

**Description:**
The one-booking-per-user-per-date rule is enforced only in the React client. There is no database `UNIQUE(user_id, date)` constraint or RLS policy that prevents a user from creating multiple bookings for the same date via direct Supabase API calls. The existing trigger uses `user_name` for the check (see H3).

**Remediation:**
Addressed by the same `UNIQUE(user_id, date)` constraint in H3. Additionally:

```sql
-- Replace the trigger's user_name check with user_id:
CREATE OR REPLACE FUNCTION public.check_booking_limit()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bookings
    WHERE user_id = NEW.user_id
    AND date = NEW.date
    AND id IS DISTINCT FROM NEW.id
    AND status != 'cancelled'
  ) THEN
    RAISE EXCEPTION 'User already has a booking for this date';
  END IF;
  RETURN NEW;
END;
$$;
```

---

### H5 — TOCTOU Race Condition in Booking Flow

> **v2.4.1 STATUS: ✅ RESOLVED** — `UNIQUE` constraint uses row-level locks, making the booking flow immune to TOCTOU race conditions.

| Field              | Detail                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **ID**             | H5                                                                                           |
| **Severity**       | **HIGH**                                                                                     |
| **CWE**            | CWE-367 (Time-of-Check Time-of-Use)                                                          |
| **OWASP**          | A01:2021 — Broken Access Control                                                             |
| **Source Reports** | business-logic BL1                                                                           |
| **Evidence**       | Booking trigger `check_booking_limit()` uses `SELECT COUNT(*)` at `READ COMMITTED` isolation |

**Description:**
The `check_booking_limit()` trigger performs a `SELECT COUNT(*)` to check for existing bookings, then the INSERT proceeds. At `READ COMMITTED` isolation level (PostgreSQL default), two concurrent transactions can both see zero existing bookings and both succeed, resulting in double-booking. This is a classic Time-of-Check-Time-of-Use (TOCTOU) race condition.

**Remediation:**
The `UNIQUE(user_id, date)` constraint from H3/H4 is the definitive fix — unique constraints use row-level locks and are immune to TOCTOU. The trigger-based `SELECT COUNT(*)` check can be removed once the constraint is in place.

Alternatively, if the trigger is retained:

```sql
-- Use advisory lock to serialize checks:
PERFORM pg_advisory_xact_lock(hashtext(NEW.user_id::text || NEW.date::text));
```

---

### H6 — No Content Security Policy (CSP)

> **v2.4.1 STATUS: ✅ RESOLVED** — CSP `<meta>` tag added in `index.html`. Note: includes `'unsafe-inline'` in `script-src` for SPA redirect support (see NEW-M1 in delta report).

| Field              | Detail                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------- |
| **ID**             | H6                                                                                        |
| **Severity**       | **HIGH**                                                                                  |
| **CWE**            | CWE-693 (Protection Mechanism Failure)                                                    |
| **OWASP**          | A05:2021 — Security Misconfiguration                                                      |
| **Source Reports** | initial-security-analysis F7, session-cookie F6, api-and-infrastructure F1                |
| **Evidence**       | No CSP header or meta tag anywhere in the codebase; GitHub Pages does not set CSP headers |

**Description:**
The application has no Content Security Policy. Combined with the use of `localStorage` for Supabase session tokens (the `@supabase/auth-helpers-js` default), any XSS vulnerability would grant an attacker full access to the user's session token. GitHub Pages does not allow custom response headers, so CSP must be set via `<meta>` tag.

**Remediation:**

```html
<!-- In index.html <head>: -->
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  img-src 'self' data:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
"
/>
```

---

### H7 — No Error Tracking Service (Sentry TODO Never Completed)

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                                                      |
| ------------------ | --------------------------------------------------------------------------- |
| **ID**             | H7                                                                          |
| **Severity**       | **HIGH**                                                                    |
| **CWE**            | CWE-778 (Insufficient Logging)                                              |
| **OWASP**          | A09:2021 — Security Logging and Monitoring Failures                         |
| **Source Reports** | logging-monitoring F1                                                       |
| **Evidence**       | `src/components/ErrorBoundary.tsx:44` — TODO comment for Sentry integration |

**Description:**
The `ErrorBoundary.componentDidCatch` method contains a TODO for Sentry integration that was never implemented. All 57 `console.error`/`console.warn`/`console.log` calls write exclusively to the ephemeral browser console. Production errors, failed API calls, and authorization failures are silently lost when the user closes the tab.

**Remediation:**

```typescript
// src/lib/errorReporting.ts
import * as Sentry from '@sentry/react';

export function initErrorReporting() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      beforeSend(event) {
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
        }
        return event;
      },
    });
  }
}
```

---

### H8 — No Client-Side Security Event Auditing

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| **ID**             | H8                                                                        |
| **Severity**       | **HIGH**                                                                  |
| **CWE**            | CWE-778 (Insufficient Logging)                                            |
| **OWASP**          | A09:2021 — Security Logging and Monitoring Failures                       |
| **Source Reports** | logging-monitoring F7                                                     |
| **Evidence**       | `src/pages/Auth.tsx` (entire file), `src/hooks/useAuth.tsx` (entire file) |

**Description:**
Security-critical events are not logged anywhere: failed login attempts (Auth.tsx:100-101 — toast only), successful logins (navigates with no log), sign-out events (useAuth.tsx:37 — no logging), password reset requests, and RLS authorization failures. The `booking_audit` table tracks booking CRUD but not security events. An account compromise would be undetectable after the fact.

**Remediation:**
Create a `logSecurityEvent()` utility and call it at every authentication event. Consider a `security_events` Supabase table for server-side persistence.

---

### H9 — No Monitoring, Alerting, or Anomaly Detection

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                              |
| ------------------ | --------------------------------------------------- |
| **ID**             | H9                                                  |
| **Severity**       | **HIGH**                                            |
| **CWE**            | CWE-778 (Insufficient Logging)                      |
| **OWASP**          | A09:2021 — Security Logging and Monitoring Failures |
| **Source Reports** | logging-monitoring F10                              |
| **Evidence**       | Absence of any monitoring configuration in codebase |

**Description:**
No uptime monitoring, error rate alerting, anomaly detection for unusual booking patterns, client-side performance monitoring, or Supabase usage/quota monitoring exists. The application could be down or under attack indefinitely with no automated notification.

**Remediation:**
Implement at minimum: (1) Sentry for error alerting, (2) GitHub Actions cron-based uptime check, (3) Supabase Dashboard alerts for usage anomalies.

---

## Medium Vulnerabilities

### M1 — Weak Password Policy (6-Character Minimum)

> **v2.4.1 STATUS: ✅ RESOLVED** — Client-side Zod schema now requires 12+ chars with uppercase, lowercase, and digit. Applied in `src/pages/Auth.tsx`. Note: `authService.ts` still has 6-char minimum (see NEW-M4 in delta report); login form incorrectly applies complexity rules (see NEW-L1).

| Field              | Detail                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| **ID**             | M1                                                                                |
| **CWE**            | CWE-521 (Weak Password Requirements)                                              |
| **OWASP**          | A07:2021 — Identification and Authentication Failures                             |
| **Source Reports** | authentication-flow-review, initial-security-analysis                             |
| **Evidence**       | `src/pages/Auth.tsx:65-68` — client-side 6-char check; Supabase default is also 6 |

Supabase's default minimum password length is 6 characters with no complexity requirements. The client-side check matches this weak default. **Fix:** Increase to 12+ characters in Supabase Dashboard > Authentication > Password Policy. Add client-side complexity check (uppercase, lowercase, digit).

---

### M2 — Account Enumeration via Signup Response

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                                                |
| ------------------ | ----------------------------------------------------- |
| **ID**             | M2                                                    |
| **CWE**            | CWE-204 (Observable Response Discrepancy)             |
| **OWASP**          | A07:2021 — Identification and Authentication Failures |
| **Source Reports** | authentication-flow-review                            |
| **Evidence**       | `src/pages/Auth.tsx:130-140`                          |

Supabase returns different responses for "email already registered" vs. new signups. The client displays these differences to the user. **Fix:** Enable "Hide confirmation sent message" in Supabase settings; show generic response regardless of outcome.

---

### M3 — Broken Password Reset Flow (PASSWORD_RECOVERY Event Unhandled)

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| **ID**             | M3                                                                       |
| **CWE**            | CWE-640 (Weak Password Recovery Mechanism)                               |
| **OWASP**          | A07:2021 — Identification and Authentication Failures                    |
| **Source Reports** | authentication-flow-review                                               |
| **Evidence**       | `src/hooks/useAuth.tsx` — `onAuthStateChange` ignores `_event` parameter |

The `useAuth` hook subscribes to `onAuthStateChange` but ignores the event type. The `PASSWORD_RECOVERY` event is never handled, meaning users clicking the password reset link get redirected to the main page with no password change UI. **Fix:** Handle `PASSWORD_RECOVERY` event and redirect to a password change form.

---

### M4 — No AuthContext (Stale Auth State Across Components)

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                                              |
| ------------------ | ------------------------------------------------------------------- |
| **ID**             | M4                                                                  |
| **CWE**            | CWE-613 (Insufficient Session Expiration)                           |
| **OWASP**          | A07:2021 — Identification and Authentication Failures               |
| **Source Reports** | authentication-flow-review, session-cookie-security                 |
| **Evidence**       | `src/hooks/useAuth.tsx` — each component gets its own hook instance |

Each component calling `useAuth()` creates its own `onAuthStateChange` subscription. There is no shared `AuthContext`, so components can have stale or inconsistent auth state. **Fix:** Create a single `AuthProvider` context component that wraps the app.

---

### M5 — `refresh_booking_summary()` DoS Vector

> **v2.4.1 STATUS: ✅ RESOLVED** — Added last-refresh timestamp check with 5-minute cooldown in `supabase/migrations/20260223000002_phase2_restrict_functions.sql`.

| Field              | Detail                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| **ID**             | M5                                                                                    |
| **CWE**            | CWE-400 (Uncontrolled Resource Consumption)                                           |
| **OWASP**          | A04:2021 — Insecure Design                                                            |
| **Source Reports** | database-security, business-logic                                                     |
| **Evidence**       | `supabase/migrations/` — SECURITY DEFINER function callable by any authenticated user |

The `refresh_booking_summary()` function performs a full table aggregation and can be called repeatedly by any authenticated user via `supabase.rpc()`, causing CPU/IO load on the database. **Fix:** Add rate limiting (e.g., check timestamp of last refresh), or move to a cron job.

---

### M6 — `booking_availability` View Exposed to `anon` Role

> **v2.4.1 STATUS: ✅ RESOLVED** — `REVOKE SELECT ON booking_availability FROM anon` in `supabase/migrations/20260223000001_phase1_security_fixes.sql`.

| Field              | Detail                                                          |
| ------------------ | --------------------------------------------------------------- |
| **ID**             | M6                                                              |
| **CWE**            | CWE-284 (Improper Access Control)                               |
| **OWASP**          | A01:2021 — Broken Access Control                                |
| **Source Reports** | database-security, api-and-infrastructure                       |
| **Evidence**       | `supabase/migrations/20260102000001_fix_security_issues.sql:22` |

The `booking_availability` view is granted SELECT to `anon`, meaning unauthenticated users can query parking availability data without signing in. **Fix:** `REVOKE SELECT ON booking_availability FROM anon;`

---

### M7 — Raw Error Messages Leaked to Users

> **v2.4.1 STATUS: ✅ RESOLVED** — Created `src/lib/errorMessages.ts` with `getUserErrorMessage()` mapper. All toast messages in `Auth.tsx` and `Index.tsx` now use generic user-facing text.

| Field              | Detail                                                                |
| ------------------ | --------------------------------------------------------------------- |
| **ID**             | M7                                                                    |
| **CWE**            | CWE-209 (Error Message Containing Sensitive Information)              |
| **OWASP**          | A04:2021 — Insecure Design                                            |
| **Source Reports** | input-validation, logging-monitoring F5                               |
| **Evidence**       | `src/pages/Auth.tsx:101,137,169`, `src/pages/Index.tsx:96-97,117-118` |

Multiple locations pass `error.message` from Supabase directly into user-visible toast notifications. These can include PostgreSQL constraint names, RLS policy names, and internal error codes. **Fix:** Map Supabase error codes to generic user-facing messages; log raw errors internally only.

---

### M8 — No Session Idle Timeout

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                                |
| ------------------ | ----------------------------------------------------- |
| **ID**             | M8                                                    |
| **CWE**            | CWE-613 (Insufficient Session Expiration)             |
| **OWASP**          | A07:2021 — Identification and Authentication Failures |
| **Source Reports** | session-cookie-security                               |
| **Evidence**       | `src/hooks/useAuth.tsx` — no idle/inactivity tracking |

There is no idle timeout. A user who walks away from a shared workstation remains logged in indefinitely (until the Supabase JWT expires). **Fix:** Add a client-side idle timer (e.g., 30 minutes) that calls `signOut()`.

---

### M9 — Hardcoded Production URL in signOut

> **v2.4.1 STATUS: ✅ RESOLVED** — Replaced with `window.location.origin + import.meta.env.BASE_URL` in `src/hooks/useAuth.tsx`.

| Field              | Detail                                             |
| ------------------ | -------------------------------------------------- |
| **ID**             | M9                                                 |
| **CWE**            | CWE-798 (Hardcoded Credentials — loosely)          |
| **OWASP**          | A05:2021 — Security Misconfiguration               |
| **Source Reports** | session-cookie-security, initial-security-analysis |
| **Evidence**       | `src/hooks/useAuth.tsx:39`                         |

The `signOut` handler uses a hardcoded URL for redirect instead of a config-driven value. This breaks in non-production environments and is fragile for deployments. **Fix:** Use `window.location.origin` or an env variable.

---

### M10 — `expire_waitlist_notifications()` Callable by Any Authenticated User

> **v2.4.1 STATUS: ✅ RESOLVED** — Added admin role check in `supabase/migrations/20260223000002_phase2_restrict_functions.sql`. **⚠️ Same caveat as H1:** uses `raw_user_meta_data` (user-writable). See NEW-H1.

| Field              | Detail                                                               |
| ------------------ | -------------------------------------------------------------------- |
| **ID**             | M10                                                                  |
| **CWE**            | CWE-269 (Improper Privilege Management)                              |
| **OWASP**          | A01:2021 — Broken Access Control                                     |
| **Source Reports** | database-security, authorization                                     |
| **Evidence**       | Supabase migrations — SECURITY DEFINER function with no caller check |

Similar to H1, this function runs as SECURITY DEFINER and any authenticated user can call it to expire waitlist notifications prematurely. **Fix:** Add admin role check or move to cron job.

---

### M11 — Unsanitized Display Name

> **v2.4.1 STATUS: ✅ RESOLVED** — Unicode-safe sanitization added at signup in `src/pages/Auth.tsx`: strips control characters, HTML tags, limits to 100 chars.

| Field              | Detail                                                         |
| ------------------ | -------------------------------------------------------------- |
| **ID**             | M11                                                            |
| **CWE**            | CWE-79 (Cross-site Scripting)                                  |
| **OWASP**          | A03:2021 — Injection                                           |
| **Source Reports** | input-validation                                               |
| **Evidence**       | `src/pages/Auth.tsx` signup flow, various rendering components |

The user's `full_name` from signup is stored in `user_metadata` and rendered in the UI without explicit sanitization. While React auto-escapes JSX, the name is also stored in `bookings.user_name` and used in database queries. **Fix:** Validate and sanitize the display name at signup (alphanumeric + spaces, max 100 chars).

---

### M12 — No Past-Date Booking Prevention (Server-Side)

> **v2.4.1 STATUS: ✅ RESOLVED** — `CHECK (date >= CURRENT_DATE)` constraint added in `supabase/migrations/20260223000001_phase1_security_fixes.sql`.

| Field              | Detail                                                     |
| ------------------ | ---------------------------------------------------------- |
| **ID**             | M12                                                        |
| **CWE**            | CWE-20 (Improper Input Validation)                         |
| **OWASP**          | A04:2021 — Insecure Design                                 |
| **Source Reports** | business-logic, input-validation                           |
| **Evidence**       | Client-side date picker only; no database CHECK constraint |

Users can create bookings for past dates by calling the Supabase API directly. **Fix:** Add a CHECK constraint: `ALTER TABLE bookings ADD CONSTRAINT bookings_future_date CHECK (date >= CURRENT_DATE);`

---

### M13 — `user_booking_stats` Exposes All User IDs

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                                                        |
| ------------------ | ------------------------------------------------------------- |
| **ID**             | M13                                                           |
| **CWE**            | CWE-200 (Exposure of Sensitive Information)                   |
| **OWASP**          | A01:2021 — Broken Access Control                              |
| **Source Reports** | database-security                                             |
| **Evidence**       | `user_booking_stats` view — accessible to authenticated users |

The `user_booking_stats` view returns aggregated data for all users. While `security_invoker = true` is set, the underlying query may expose `user_id` UUIDs for all users. **Fix:** Add RLS filtering or restrict to current user's stats only.

---

### M14 — `console.error` Active in Production

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                                              |
| ------------------ | ------------------------------------------------------------------- |
| **ID**             | M14                                                                 |
| **CWE**            | CWE-532 (Sensitive Information in Log Files)                        |
| **OWASP**          | A09:2021 — Security Logging and Monitoring Failures                 |
| **Source Reports** | logging-monitoring F3, initial-security-analysis                    |
| **Evidence**       | 57 `console.*` calls across the codebase — all active in production |

All console logging is unconditional — raw Supabase error objects (including PostgreSQL error codes, table names, constraint names) are logged to the browser console in production. **Fix:** Create a centralized logger that sanitizes output and conditionally logs based on environment.

---

### M15 — No Query Pagination/Limits

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                                                               |
| ------------------ | -------------------------------------------------------------------- |
| **ID**             | M15                                                                  |
| **CWE**            | CWE-400 (Uncontrolled Resource Consumption)                          |
| **OWASP**          | A04:2021 — Insecure Design                                           |
| **Source Reports** | api-and-infrastructure, database-security                            |
| **Evidence**       | `src/services/bookingService.ts` — `.select('*')` without `.limit()` |

Several Supabase queries fetch all rows with no pagination or limit. As data grows, this creates performance and DoS risk. **Fix:** Add `.limit(100)` or implement cursor-based pagination.

---

### M16 — Failed Login Attempts Not Logged

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                              |
| ------------------ | --------------------------------------------------- |
| **ID**             | M16                                                 |
| **CWE**            | CWE-778 (Insufficient Logging)                      |
| **OWASP**          | A09:2021 — Security Logging and Monitoring Failures |
| **Source Reports** | logging-monitoring F2                               |
| **Evidence**       | `src/pages/Auth.tsx:100-101` — toast only, no log   |

When login fails, only a toast is shown. No console output, no structured log, no event sent to monitoring. Brute-force attempts are invisible. **Fix:** Log failed login events (with masked email) via structured logger.

---

### M17 — No Structured Logging Format

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                              |
| ------------------ | --------------------------------------------------- |
| **ID**             | M17                                                 |
| **CWE**            | CWE-117 (Improper Output Neutralization for Logs)   |
| **OWASP**          | A09:2021 — Security Logging and Monitoring Failures |
| **Source Reports** | logging-monitoring F6                               |
| **Evidence**       | All 57 console calls across the codebase            |

No consistent log format, no correlation IDs, no severity levels, no timestamps. Logs cannot be searched, aggregated, or alerted on. **Fix:** Create a `logger.ts` utility with structured JSON format.

---

### M18 — `booking_audit` IP/User-Agent Never Populated

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3.

| Field              | Detail                                                                |
| ------------------ | --------------------------------------------------------------------- |
| **ID**             | M18                                                                   |
| **CWE**            | CWE-778 (Insufficient Logging)                                        |
| **OWASP**          | A09:2021 — Security Logging and Monitoring Failures                   |
| **Source Reports** | logging-monitoring F9                                                 |
| **Evidence**       | `supabase/migrations/20260103000003_v2_booking_audit.sql:15-16,47-59` |

The `booking_audit` table defines `ip_address INET` and `user_agent TEXT` columns, but the trigger functions never populate them (always NULL). **Fix:** Use `current_setting('request.headers', true)` in triggers to extract PostgREST request context.

---

### M19 — `process.env.NODE_ENV` Check Never Evaluates in Vite

> **v2.4.1 STATUS: ✅ RESOLVED** — Replaced with `import.meta.env.DEV` in `src/components/ErrorBoundary.tsx`.

| Field              | Detail                                            |
| ------------------ | ------------------------------------------------- |
| **ID**             | M19                                               |
| **CWE**            | CWE-215 (Sensitive Information in Debugging Code) |
| **OWASP**          | A05:2021 — Security Misconfiguration              |
| **Source Reports** | logging-monitoring F4                             |
| **Evidence**       | `src/components/ErrorBoundary.tsx:73`             |

The ErrorBoundary uses `process.env.NODE_ENV === 'development'` to conditionally show error details, but Vite uses `import.meta.env.MODE` — so this check is always false. If naively "fixed", it would expose error stack traces in the UI. **Fix:** Replace with `import.meta.env.DEV` and render only `error.message`, not full stack traces.

---

## Low Vulnerabilities

### L1 — Sidebar Cookie Missing Secure/SameSite Attributes

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                                      |
| ------------------ | ------------------------------------------- |
| **Source Reports** | session-cookie-security                     |
| **Evidence**       | Sidebar state cookie set without attributes |

The sidebar open/close state uses a cookie without `Secure` or `SameSite` attributes. While this cookie contains no sensitive data, it's bad practice. **Fix:** Set `Secure; SameSite=Strict` on the cookie.

---

### L2 — signOut Uses `scope: 'local'` Only

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                     |
| ------------------ | -------------------------- |
| **Source Reports** | session-cookie-security    |
| **Evidence**       | `src/hooks/useAuth.tsx:37` |

The `signOut` call uses local scope, which only clears the current browser's session. Other devices remain logged in. **Fix:** Use `scope: 'global'` or offer the user a choice.

---

### L3 — No Secret Rotation Documentation

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                   |
| ------------------ | ------------------------ |
| **Source Reports** | secrets-management-audit |

There is no documented process for rotating Supabase API keys, GitHub tokens, or any other secrets. **Fix:** Create a `docs/secret-rotation.md` runbook.

---

### L4 — `process.env.NODE_ENV` Reference in Vite App

> **v2.4.1 STATUS: ✅ RESOLVED** — Duplicate of M19; fixed in same change to `src/components/ErrorBoundary.tsx`.

| Field              | Detail                                           |
| ------------------ | ------------------------------------------------ |
| **Source Reports** | initial-security-analysis, logging-monitoring F4 |
| **Evidence**       | `src/components/ErrorBoundary.tsx:73`            |

Using `process.env.NODE_ENV` in a Vite application is a code smell. Vite does not define `process.env` by default (it uses `import.meta.env`). This specific instance is also covered by M19. **Fix:** Replace with `import.meta.env.DEV`.

---

### L5 — JWT-Shaped Test Fixture in Codebase

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                   |
| ------------------ | ------------------------ |
| **Source Reports** | secrets-management-audit |

A test file contains a JWT-shaped string that could be mistaken for a real token. **Fix:** Add a comment clarifying it's a test fixture, or use an obviously-fake value.

---

### L6 — No Data Retention/Cleanup Policy

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                            |
| ------------------ | --------------------------------- |
| **Source Reports** | database-security, business-logic |

There is no mechanism to purge old bookings, expired waitlist entries, or old audit records. Data grows unbounded. **Fix:** Add a Supabase cron job or Edge Function for data retention (e.g., delete bookings older than 1 year).

---

### L7 — Audit Trail Incomplete (IP/User-Agent Never Populated)

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Overlaps with M18. Deferred to Phase 3.

| Field              | Detail                |
| ------------------ | --------------------- |
| **Source Reports** | logging-monitoring F9 |

Partially overlaps with M18. The audit table exists but key forensic columns are always NULL. See M18 for remediation.

---

### L8 — Type Assertions Without Runtime Validation

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                                                  |
| ------------------ | ------------------------------------------------------- |
| **Source Reports** | code-quality-metrics-standards                          |
| **Evidence**       | Multiple `as` type assertions across hooks and services |

TypeScript `as` casts are used without runtime validation of Supabase response shapes. If the API response changes, the app silently uses incorrect data. **Fix:** Use Zod schemas to validate API responses at runtime.

---

### L9 — Missing CHECK Constraints on Recurring Bookings / Waitlist Tables

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail            |
| ------------------ | ----------------- |
| **Source Reports** | database-security |

The `recurring_bookings` and `waitlist` tables lack CHECK constraints for valid enum values and date ranges. **Fix:** Add constraints, e.g., `CHECK (day_of_week BETWEEN 0 AND 6)`.

---

### L10 — Environment Variables Logged in Dev Mode

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 4.

| Field              | Detail                 |
| ------------------ | ---------------------- |
| **Source Reports** | logging-monitoring F8  |
| **Evidence**       | `src/lib/env.ts:80-85` |

The app logs environment config to console when `DEV` is true. Currently does not include secrets, but the pattern invites future leakage. **Fix:** Restrict to `{ mode: env.MODE }` only.

---

### L11 — 404 Route Logs Unsanitized Path

> **v2.4.1 STATUS: ✅ RESOLVED** — Sanitization regex applied in `src/pages/NotFound.tsx`: `pathname.replace(/[^\w/.\-]/g, '_')`.

| Field              | Detail                      |
| ------------------ | --------------------------- |
| **Source Reports** | logging-monitoring F11      |
| **Evidence**       | `src/pages/NotFound.tsx:11` |

The 404 handler logs `location.pathname` without sanitization. A crafted URL with control characters could inject fake log entries. **Fix:** Sanitize with `pathname.replace(/[^\w/.-]/g, '_')`.

---

### L12 — Raw Supabase Errors Logged Unsanitized

> **v2.4.1 STATUS: ⚠️ STILL OPEN** — Deferred to Phase 3 (with M14).

| Field              | Detail                           |
| ------------------ | -------------------------------- |
| **Source Reports** | logging-monitoring F3            |
| **Evidence**       | 57 console calls across codebase |

All `console.error` calls pass raw Supabase error objects that may contain PostgreSQL table names, constraint names, and query hints. See M14 for the production-exposure angle. **Fix:** Centralized logger that extracts only `error.code` and `error.message`.

---

## OWASP Top 10 (2021) Mapping

| OWASP Category                                    | Finding IDs                          | Risk Level   | Summary                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------- | ------------------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01: Broken Access Control**                    | C1, H1, H2, H3, H4, H5, M6, M10, M13 | **Critical** | The most affected category. Client-only tenant boundary (C1) is the critical gap. Multiple SECURITY DEFINER functions callable without authorization (H1, M10). Missing WITH CHECK on UPDATE policy (H2). Identity tied to mutable display name (H3). No server-side booking uniqueness (H4, H5). |
| **A02: Cryptographic Failures**                   | —                                    | **Low**      | No custom cryptography. Supabase handles password hashing (bcrypt) and JWT signing. HTTPS enforced by GitHub Pages. No sensitive data stored client-side beyond session tokens.                                                                                                                   |
| **A03: Injection**                                | M11                                  | **Low**      | No SQL injection vectors (PostgREST parameterized queries). Minor XSS risk from unsanitized display names (M11), mitigated by React's auto-escaping.                                                                                                                                              |
| **A04: Insecure Design**                          | H4, H5, M5, M7, M12, M15             | **High**     | Business logic enforced only client-side (H4, M12). Race conditions in booking flow (H5). DoS vectors from unbounded queries and unprotected admin functions (M5, M15).                                                                                                                           |
| **A05: Security Misconfiguration**                | H6, M9, M19                          | **High**     | No CSP header (H6) is the primary concern. Hardcoded URLs (M9). Incorrect Vite env check (M19).                                                                                                                                                                                                   |
| **A06: Vulnerable Components**                    | —                                    | **Very Low** | All dependencies scanned via Grype. Zero known CVEs. SBOM generated.                                                                                                                                                                                                                              |
| **A07: Identification & Authentication Failures** | M1, M2, M3, M4, M8                   | **Medium**   | Weak password policy (M1), account enumeration (M2), broken password reset (M3), no shared auth context (M4), no session idle timeout (M8).                                                                                                                                                       |
| **A08: Software and Data Integrity Failures**     | —                                    | **Very Low** | SLSA L3 build provenance, Sigstore signing, SBOM — very strong. No deserialization attack surface.                                                                                                                                                                                                |
| **A09: Security Logging & Monitoring Failures**   | H7, H8, H9, M14, M16, M17, M18       | **High**     | The second most affected category. Zero error tracking (H7), zero security event logging (H8), zero monitoring/alerting (H9). All logging is ephemeral browser console with no structure (M14, M17). Audit table missing key forensic data (M18).                                                 |
| **A10: Server-Side Request Forgery**              | —                                    | **N/A**      | No server-side HTTP request functionality. SPA architecture makes SSRF not applicable.                                                                                                                                                                                                            |

---

## GDPR Compliance Assessment

The application processes personal data of Lufthansa Technik employees (names, email addresses, booking patterns, vehicle information) and must comply with GDPR as it operates within the EU.

| GDPR Requirement                               | Status      | Finding                                                                                                           | Remediation                                                     |
| ---------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Art. 5(1)(a) — Lawfulness & Transparency**   | **Partial** | No privacy policy or data processing notice displayed to users.                                                   | Add a privacy notice explaining what data is collected and why. |
| **Art. 5(1)(b) — Purpose Limitation**          | **Pass**    | Data is used only for parking management. No analytics, tracking, or marketing.                                   | —                                                               |
| **Art. 5(1)(c) — Data Minimization**           | **Pass**    | Only necessary fields collected (name, email, vehicle type, booking dates).                                       | —                                                               |
| **Art. 5(1)(e) — Storage Limitation**          | **Fail**    | No data retention policy (L6). Old bookings, audit records, and user data accumulate indefinitely.                | Implement automated data purge after defined retention period.  |
| **Art. 5(1)(f) — Integrity & Confidentiality** | **Partial** | HTTPS enforced, RLS enabled. But: no CSP (H6), client-only tenant boundary (C1), mutable identity (H3).           | Fix C1, H6, H3 to meet this requirement.                        |
| **Art. 6 — Lawful Basis**                      | **Unclear** | No documented lawful basis for processing. Likely "legitimate interest" (employer parking management).            | Document the lawful basis.                                      |
| **Art. 12-14 — Information to Data Subjects**  | **Fail**    | No privacy notice, no information about data processing, no contact for DPO.                                      | Create and display a privacy policy.                            |
| **Art. 15 — Right of Access**                  | **Partial** | Users can see their own bookings via the UI. No formal data export feature.                                       | Add a "Download My Data" feature.                               |
| **Art. 17 — Right to Erasure**                 | **Fail**    | No account deletion or data erasure capability in the UI or backend.                                              | Implement account deletion with cascading data purge.           |
| **Art. 25 — Data Protection by Design**        | **Partial** | RLS provides technical access control. But client-only domain check (C1) and identity issues (H3) undermine this. | Fix C1 and H3.                                                  |
| **Art. 30 — Records of Processing**            | **Fail**    | No data processing register or documentation.                                                                     | Create a Record of Processing Activities (ROPA).                |
| **Art. 32 — Security of Processing**           | **Partial** | Encryption in transit (HTTPS), access control (RLS). But gaps: no CSP, no monitoring, weak passwords.             | Fix high-severity findings to achieve adequate security.        |
| **Art. 33 — Breach Notification**              | **Fail**    | No incident response plan. No monitoring to detect breaches (H7, H8, H9).                                         | Create incident response plan; implement monitoring.            |
| **Art. 35 — DPIA**                             | **Unclear** | No Data Protection Impact Assessment conducted. May not be required for this scale but recommended.               | Conduct a DPIA.                                                 |

**GDPR Risk Level: Medium-High** — The application collects employee PII within the EU without a privacy notice, data retention policy, erasure capability, or breach detection capability.

---

## Remediation Roadmap

### Phase 1 — Critical & Quick Wins (Week 1-2) ✅ COMPLETED in v2.4.0

| Priority | Finding                                             | Effort     | Impact                                         | Status                       |
| -------- | --------------------------------------------------- | ---------- | ---------------------------------------------- | ---------------------------- |
| **P0**   | C1 — Server-side email domain enforcement           | 2 hours    | Closes the only tenant boundary gap            | ⚠️ Requires dashboard config |
| **P0**   | H2 — Add `WITH CHECK` to UPDATE policy              | 15 minutes | Prevents booking ownership transfer            | ✅ Done                      |
| **P1**   | H3/H4/H5 — Add `UNIQUE(user_id, date)` constraint   | 1 hour     | Fixes identity, uniqueness, and race condition | ✅ Done                      |
| **P1**   | H6 — Add CSP meta tag                               | 30 minutes | Blocks XSS-based token theft                   | ✅ Done                      |
| **P1**   | M6 — Revoke `anon` access to `booking_availability` | 5 minutes  | Closes unauthenticated data access             | ✅ Done                      |
| **P1**   | M7 — Replace raw error messages with generic ones   | 2 hours    | Stops information leakage via toasts           | ✅ Done                      |

### Phase 2 — High Severity (Week 2-4) ✅ COMPLETED in v2.4.0-v2.4.1

| Priority | Finding                                          | Effort     | Impact                            | Status                  |
| -------- | ------------------------------------------------ | ---------- | --------------------------------- | ----------------------- |
| **P2**   | H1 — Restrict `generate_recurring_bookings()`    | 1 hour     | Prevents booking injection attack | ✅ Done (⚠️ see NEW-H1) |
| **P2**   | M10 — Restrict `expire_waitlist_notifications()` | 30 minutes | Prevents waitlist manipulation    | ✅ Done (⚠️ see NEW-H1) |
| **P2**   | M5 — Rate-limit `refresh_booking_summary()`      | 1 hour     | Prevents DoS                      | ✅ Done                 |
| **P2**   | M1 — Increase password minimum to 12 chars       | 15 minutes | Stronger auth                     | ✅ Done                 |
| **P2**   | M3 — Handle `PASSWORD_RECOVERY` event            | 2 hours    | Fix broken password reset         | ⚠️ Deferred to Phase 3  |
| **P2**   | M4 — Create `AuthProvider` context               | 3 hours    | Consistent auth state             | ⚠️ Deferred to Phase 3  |
| **P2**   | M8 — Add session idle timeout                    | 1 hour     | Prevent shared-workstation abuse  | ⚠️ Deferred to Phase 3  |
| **P2**   | M12 — Add `CHECK (date >= CURRENT_DATE)`         | 15 minutes | Prevent past-date bookings        | ✅ Done                 |
| **P2**   | M9 — Hardcoded production URL in signOut         | 15 minutes | Environment-agnostic redirects    | ✅ Done                 |
| **P2**   | M11 — Unsanitized display name                   | 30 minutes | XSS defense-in-depth              | ✅ Done                 |
| **P2**   | M19/L4 — `process.env.NODE_ENV` in Vite app      | 15 minutes | Correct env detection             | ✅ Done                 |
| **P2**   | L11 — 404 route logs unsanitized path            | 15 minutes | Log injection prevention          | ✅ Done                 |

### Phase 3 — Observability, Auth Fixes & New Findings (Week 3-6) ⬜ NOT STARTED

| Priority | Finding                                                 | Effort  | Impact                          |
| -------- | ------------------------------------------------------- | ------- | ------------------------------- | ------ | ----------------- |
| **P1**   | **NEW-H1** — Fix admin role check (use `app_metadata`)  | 1 hour  | **Closes privilege escalation** |
| **P1**   | **NEW-L1** — Remove password complexity from login form | 30 min  | **Unblocks existing users**     |
| **P2**   | H7 — Integrate Sentry error tracking                    | 4 hours | Production error visibility     |
| **P2**   | H8 — Add security event logging                         | 4 hours | Forensic capability             |
| **P2**   | H9 — Add uptime monitoring                              | 2 hours | Detect outages                  |
| **P2**   | M3 — Handle `PASSWORD_RECOVERY` event                   | 2 hours | Fix broken password reset       |
| **P2**   | M4 — Create `AuthProvider` context                      | 3 hours | Consistent auth state           |
| **P2**   | M8 — Add session idle timeout                           | 1 hour  | Shared-workstation safety       |
| **P2**   | **NEW-M2** — Remove `                                   |         | true` from release.yml          | 15 min | CI test integrity |
| **P3**   | M14/M17 — Create centralized structured logger          | 4 hours | Replace all 57 console calls    |
| **P3**   | M16 — Log failed login attempts                         | 1 hour  | Detect brute-force attacks      |
| **P3**   | M18 — Populate audit IP/user-agent                      | 2 hours | Complete forensic trail         |

**Estimated total: ~3-4 days of focused work.**

### Phase 4 — Compliance, Code Quality & Hardening (Month 2-3) ⬜ NOT STARTED

| Priority | Finding                                                 | Effort     | Impact                        |
| -------- | ------------------------------------------------------- | ---------- | ----------------------------- |
| **P3**   | GDPR — Privacy notice                                   | 4 hours    | Legal compliance              |
| **P3**   | GDPR — Data retention policy + purge                    | 4 hours    | Storage limitation compliance |
| **P3**   | GDPR — Right to erasure                                 | 8 hours    | Art. 17 compliance            |
| **P3**   | GDPR — Record of Processing Activities                  | 4 hours    | Art. 30 compliance            |
| **P3**   | **NEW-M3** — Fix client duplicate check (use `user_id`) | 30 min     | Correct UX                    |
| **P3**   | **NEW-M4** — Unify password schema                      | 1 hour     | Consistent validation         |
| **P3**   | **NEW-L7** — Add tests for security code                | 4 hours    | Automated verification        |
| **P4**   | L1-L12 — All remaining low-severity items               | 4-8 hours  | Defense-in-depth              |
| **P4**   | M2 — Account enumeration                                | 30 minutes | Minor auth improvement        |
| **P4**   | M13/M15 — Stats exposure / pagination                   | 2 hours    | Data access hygiene           |
| **P4**   | **NEW-L2 through NEW-L6** — New low-severity items      | 2-3 hours  | Re-audit findings             |

**Estimated total: ~5-6 days of focused work.**

---

## Security Recommendations

### Architecture-Level

1. **Enforce all business rules server-side.** The pattern of client-only validation (domain check, booking uniqueness, date validation) is the root cause of most findings. Every rule in React should have a corresponding database constraint, RLS policy, or Edge Function check.

2. **Migrate identity from `user_name` to `user_id` everywhere.** This is a schema-level change that resolves H3, H4, and parts of other findings. The `user_name` column should be a denormalized display field only.

3. **Adopt a zero-trust client model.** Treat the React SPA as an untrusted interface. All security decisions must be enforced in Supabase (database layer).

### Authentication & Session

4. **Implement an `AuthProvider` context** — single source of truth for auth state, handles all event types including `PASSWORD_RECOVERY`.

5. **Add session idle timeout** (30 minutes) and `scope: 'global'` sign-out option.

6. **Increase password policy** to 12+ characters with complexity requirements.

### Database & API

7. **Audit all `SECURITY DEFINER` functions** — each must verify `auth.uid()` and caller role. Consider converting to `SECURITY INVOKER` where possible.

8. **Add `WITH CHECK` clauses to all UPDATE/INSERT policies** — currently only `USING` is specified on several policies.

9. **Add database CHECK constraints** for all enum fields, date ranges, and numeric bounds.

10. **Implement query pagination** — add `.limit()` and `.range()` to all Supabase queries.

### Observability

11. **Integrate Sentry** (or equivalent) for error tracking, security event logging, and alerting. This single change addresses H7, H8, H9, M14, and M16.

12. **Create a centralized logger** (`src/lib/logger.ts`) with structured JSON output, PII scrubbing, and environment-aware verbosity.

13. **Populate audit columns** — use PostgREST request headers in triggers to fill `ip_address` and `user_agent`.

### Compliance

14. **Create a privacy notice** for GDPR Art. 12-14 compliance.
15. **Implement data retention** — automated purge of records older than retention period.
16. **Add "Delete My Account" feature** for GDPR Art. 17 right to erasure.
17. **Document the lawful basis** for data processing and create a Record of Processing Activities.

---

## Testing Guide

### Testing C1 — Email Domain Bypass

```bash
# Verify server-side domain enforcement is in place.
# Using the Supabase anon key (publicly available in page source):
curl -X POST 'https://<project>.supabase.co/auth/v1/signup' \
  -H 'apikey: <anon-key>' \
  -H 'Content-Type: application/json' \
  -d '{"email": "test@evil.com", "password": "password123456"}'

# Expected AFTER fix: 400/403 error mentioning domain restriction
# Current behavior: 200 success — account created
```

### Testing H2 — UPDATE Policy WITH CHECK

```bash
# As authenticated user, try to change user_id on own booking:
curl -X PATCH 'https://<project>.supabase.co/rest/v1/bookings?id=eq.<your-booking-id>' \
  -H 'apikey: <anon-key>' \
  -H 'Authorization: Bearer <your-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{"user_id": "<other-users-uuid>"}'

# Expected AFTER fix: RLS policy violation error
# Current behavior: 200 success — ownership transferred
```

### Testing H3/H4 — Booking Uniqueness

```javascript
// As authenticated user, create two bookings for the same date:
const { data: b1 } = await supabase.from('bookings').insert({
  date: '2026-03-01',
  user_id: myId,
  user_name: 'Test',
  spot_number: 1,
  duration: 'full_day',
  vehicle_type: 'car',
  status: 'active',
});
const { data: b2 } = await supabase.from('bookings').insert({
  date: '2026-03-01',
  user_id: myId,
  user_name: 'Test',
  spot_number: 2,
  duration: 'full_day',
  vehicle_type: 'car',
  status: 'active',
});
// Expected AFTER fix: b2 returns a unique constraint violation
// Current behavior: Both succeed
```

### Testing H5 — Race Condition

```javascript
// Send two booking requests simultaneously:
const results = await Promise.all([
  supabase.from('bookings').insert({ date: '2026-03-02', user_id: myId, ... }),
  supabase.from('bookings').insert({ date: '2026-03-02', user_id: myId, ... }),
]);
// Expected AFTER fix (UNIQUE constraint): Exactly one succeeds, one fails
// Current behavior: Both may succeed
```

### Testing H6 — CSP Verification

```bash
# Check for CSP header or meta tag:
curl -s -D - https://miguel11nines.github.io/park-it-easy-office/ | grep -i 'content-security-policy'

# Or inspect the HTML for <meta http-equiv="Content-Security-Policy">
# Expected AFTER fix: CSP policy present
# Current behavior: No CSP found
```

### Testing H1 — Unauthorized RPC Call

```javascript
// As a regular authenticated user (not admin):
const { data, error } = await supabase.rpc('generate_recurring_bookings', {
  p_days_ahead: 365,
});
// Expected AFTER fix: Error — "Only admins can generate recurring bookings"
// Current behavior: Succeeds — generates bookings for ALL users
```

### Testing M6 — Anon Access to booking_availability

```bash
# Without authentication (anon key only):
curl 'https://<project>.supabase.co/rest/v1/booking_availability?select=*' \
  -H 'apikey: <anon-key>'

# Expected AFTER fix: 401/403 — permission denied
# Current behavior: 200 — returns availability data
```

### Testing M12 — Past-Date Booking

```javascript
// Try to create a booking for yesterday:
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
const { data, error } = await supabase.from('bookings').insert({
  date: yesterday,
  user_id: myId,
  user_name: 'Test',
  spot_number: 1,
  duration: 'full_day',
  vehicle_type: 'car',
  status: 'active',
});
// Expected AFTER fix: CHECK constraint violation
// Current behavior: 200 — booking created for past date
```

### Regression Testing Checklist

After applying fixes, verify:

- [ ] Existing `@lht.dlh.de` users can still sign up and log in
- [ ] Non-`@lht.dlh.de` signups are rejected server-side
- [ ] Users can create, view, and cancel their own bookings
- [ ] Users cannot create two bookings for the same date
- [ ] Users cannot modify another user's booking
- [ ] Password reset flow works end-to-end
- [ ] CSP does not block legitimate Supabase API calls
- [ ] Error messages shown to users are generic (no internal details)
- [ ] Console logging is structured and sanitized in production
- [ ] Sentry receives error reports from production
- [ ] All existing RLS policies still function correctly

---

## Risk Score Summary

| Audit Domain              | v2.3.3 | v2.4.1  | Change | Key Concern                                              |
| ------------------------- | ------ | ------- | ------ | -------------------------------------------------------- |
| Initial Security Analysis | 4.5    | **3.5** | ▼ 1.0  | CSP added; client-only domain check remains (C1)         |
| Authentication Flow       | 5.2    | **4.5** | ▼ 0.7  | Stronger passwords; broken reset + no AuthContext remain |
| Authorization             | 4.8    | **3.2** | ▼ 1.6  | WITH CHECK + UNIQUE + admin checks; NEW-H1 caveat        |
| Input Validation          | 3.5    | **2.8** | ▼ 0.7  | Past-date + sanitization + error mapping done            |
| Database Security         | 5.8    | **3.8** | ▼ 2.0  | UNIQUE constraint, anon revoked, admin checks            |
| Session & Cookie          | 6.0    | **5.5** | ▼ 0.5  | CSP added; no idle timeout yet                           |
| Secrets Management        | 3.0    | **3.0** | —      | No changes in scope                                      |
| API & Infrastructure      | 5.4    | **4.2** | ▼ 1.2  | Anon access removed, rate limiting, CSP                  |
| Business Logic            | 6.4    | **4.0** | ▼ 2.4  | UNIQUE + past-date + admin functions restricted          |
| File Handling             | 1.0    | **1.0** | —      | No file handling = no attack surface                     |
| Logging & Monitoring      | 7.0    | **7.0** | —      | Zero changes in Phase 1-2 (Phase 3 scope)                |

**Weighted Overall: ~~5.1~~ → 3.8 / 10** (▼ 1.3 points)

**Interpretation:**

- **1-3:** Low risk — minor improvements needed
- **4-6:** Medium risk — significant gaps requiring planned remediation
- **7-9:** High risk — critical issues requiring immediate attention
- **10:** Severe — system should not be in production

The application has improved from **medium risk (5.1)** to **low-medium risk (3.8)** after Phase 1-2 remediation. The strong CI/CD security, clean dependencies, proper RLS foundation, and now CSP + database constraints bring the score down. The critical tenant boundary issue (C1) and the cluster of logging/monitoring gaps (7.0/10) are the remaining drivers. **Fixing C1 (dashboard config) would drop the score to ~3.3/10.** Completing Phase 3 (Sentry + logging) would bring it to approximately **2.5/10** (low risk).

---

## Appendix: Source Reports

| #   | Report                       | File                                                      | Findings                    |
| --- | ---------------------------- | --------------------------------------------------------- | --------------------------- |
| 1   | Initial Security Analysis    | `audits/security/initial-security-analysis.md`            | 8 findings                  |
| 2   | Authentication Flow Review   | `audits/security/authentication-flow-review.md`           | Multiple findings           |
| 3   | Authorization Implementation | `audits/security/authorization-implementation.md`         | 7+ findings                 |
| 4   | Input Validation             | `audits/security/input-validation.md`                     | 6+ findings                 |
| 5   | Database Security            | `audits/security/database-security.md`                    | 14+ findings                |
| 6   | Session & Cookie Security    | `audits/security/session-cookie-security.md`              | 6+ findings                 |
| 7   | Secrets Management           | `audits/security/secrets-management-audit.md`             | 5+ findings                 |
| 8   | API & Infrastructure         | `audits/security/api-and-infrastructure.md`               | 9+ findings                 |
| 9   | Business Logic               | `audits/security/business-logic-vulnerabilities.md`       | 7+ findings                 |
| 10  | File Handling                | `audits/security/file-handling-business-logic.md`         | Minimal (no attack surface) |
| 11  | Logging & Monitoring         | `audits/security/logging-monitoring.md`                   | 11 findings                 |
| 12  | Code Quality: Design         | `audits/code-quality/initial-software-design-analysis.md` | Architecture analysis       |
| 13  | Code Quality: Metrics        | `audits/code-quality/code-quality-metrics-standards.md`   | Standards compliance        |

---

_Report generated: 2026-02-23 | park-it-easy-office v2.3.3 (original) → v2.4.1 (updated) | Comprehensive consolidation of 11 security audits + 2 code quality audits + 6 parallel re-audit agents | See `audits/v2.4.1-delta-report.md` for full delta_
