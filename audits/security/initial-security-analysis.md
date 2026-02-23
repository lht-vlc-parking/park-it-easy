# Initial Security Analysis

**Date:** 2026-02-23
**Scope:** Full codebase — `src/`, config, CI/CD, `supabase/`, dependencies
**Risk Score: 4.5 / 10** (Medium)

---

## Attack Surface Map

```
                            ┌─────────────────────┐
                            │   GitHub Pages CDN   │
                            │  (static SPA host)   │
                            └──────────┬──────────┘
                                       │ HTTPS
                            ┌──────────▼──────────┐
                            │   React SPA Bundle   │
                            │  (public JS/HTML)    │
                            ├─────────────────────┤
                            │ Embedded in bundle:  │
                            │  • Supabase URL      │
                            │  • Supabase Anon Key │
                            │  • Base path config  │
                            └──────────┬──────────┘
                                       │ HTTPS (PostgREST + Auth API)
                            ┌──────────▼──────────┐
                            │   Supabase Backend   │
                            ├─────────────────────┤
                            │ Auth │ PostgreSQL    │
                            │ RLS  │ Functions     │
                            │ Views│ Triggers      │
                            └─────────────────────┘
```

**Entry Points:**

1. `/auth` — Login, signup, password reset forms
2. `/` — Booking CRUD (protected route)
3. `/statistics` — Read-only statistics (protected route)
4. Supabase REST API (directly callable with anon key from browser DevTools)
5. Supabase Auth API (directly callable)

---

## Findings

### F1 — Client-Side-Only Email Domain Restriction

|                    |                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **High**                                                                                                                                               |
| **CWE**            | CWE-602 (Client-Side Enforcement of Server-Side Security)                                                                                              |
| **Evidence**       | `src/pages/Auth.tsx:14,53-66`                                                                                                                          |
| **What**           | Email domain `@lht.dlh.de` is validated only in the React UI. An attacker can bypass the UI and call `supabase.auth.signUp()` directly with any email. |
| **Why it matters** | Unauthorized users outside the organization can create accounts and access the parking system.                                                         |

**PoC:**

```js
// In browser console on the deployed site:
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient('SUPABASE_URL', 'ANON_KEY');
await sb.auth.signUp({ email: 'attacker@gmail.com', password: 'password123' });
```

**Remediation:** Configure email domain restriction in Supabase Auth settings, or use a database trigger/edge function to reject non-corporate signups server-side.

---

### F2 — Mock Supabase Client When Unconfigured

|              |                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | **Medium**                                                                                                                                                                                                          |
| **CWE**      | CWE-1188 (Insecure Default Initialization)                                                                                                                                                                          |
| **Evidence** | `src/integrations/supabase/client.ts:12-29`                                                                                                                                                                         |
| **What**     | If env vars are missing, a mock client is created that returns `null` sessions. `ProtectedRoute` checks `!user` and redirects, so this isn't directly exploitable, but the mock pattern creates a fragile fallback. |

**Remediation:** Fail hard in production:

```ts
if (!isSupabaseConfigured && import.meta.env.PROD) {
  throw new Error('Supabase credentials required in production');
}
```

---

### F3 — User Identity by Display Name, Not user_id

|                    |                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                            |
| **CWE**            | CWE-639 (Authorization Bypass Through User-Controlled Key)                                                            |
| **Evidence**       | `src/pages/Index.tsx:142,292`, `src/components/BookingDialogWithValidation.tsx:74`                                    |
| **What**           | `isMyBooking` determined by matching `userName` string. Duplicate booking check queries by `user_name` not `user_id`. |
| **Why it matters** | Two users with the same display name could see each other's bookings as "mine" and block each other from booking.     |

**Remediation:** Use `user_id` for all identity checks:

```ts
const isMyBooking = booking.user_id === user.id;
```

---

### F4 — Hardcoded Production URL

|              |                                                                                     |
| ------------ | ----------------------------------------------------------------------------------- |
| **Severity** | **Medium**                                                                          |
| **CWE**      | CWE-547 (Use of Hard-coded, Security-relevant Constants)                            |
| **Evidence** | `src/hooks/useAuth.tsx:39`                                                          |
| **What**     | `window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth'` |

**Remediation:**

```ts
window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
```

---

### F5 — `booking_availability` View Granted to `anon` Role

|              |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **Severity** | **Medium**                                                                        |
| **CWE**      | CWE-284 (Improper Access Control)                                                 |
| **Evidence** | `supabase/migrations/20260102000001_fix_security_issues.sql:22`                   |
| **What**     | Unauthenticated users with just the anon key can query booking availability data. |

**Remediation:**

```sql
REVOKE SELECT ON public.booking_availability FROM anon;
```

---

### F6 — `dist/` Directory Committed to Repo

|              |                                                               |
| ------------ | ------------------------------------------------------------- |
| **Severity** | **Low**                                                       |
| **Evidence** | Repository root contains `dist/` directory                    |
| **What**     | Built artifacts may contain embedded env vars or source maps. |

**Remediation:** Add `dist/` to `.gitignore` and remove from git history.

---

### F7 — No CSP Headers

|              |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Severity** | **Low**                                                                                       |
| **CWE**      | CWE-1021 (Improper Restriction of Rendered UI Layers)                                         |
| **Evidence** | `index.html` — no CSP meta tag                                                                |
| **What**     | No Content Security Policy configured. `SECURITY.md` recommends CSP but it's not implemented. |

**Remediation:** Add CSP meta tag to `index.html`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co;"
/>
```

---

### F8 — `generate_recurring_bookings` Callable by Any Authenticated User

|              |                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| **Severity** | **Low-Medium**                                                                                                 |
| **CWE**      | CWE-862 (Missing Authorization)                                                                                |
| **Evidence** | `supabase/migrations/20260103000004_v2_recurring_bookings.sql:78`                                              |
| **What**     | `SECURITY DEFINER` function granted to all authenticated users. Can generate recurring bookings for all users. |

**Remediation:** Restrict to service role or add admin check.

---

## Dependencies Assessment

| Package                 | Version | Risk                             |
| ----------------------- | ------- | -------------------------------- |
| `@supabase/supabase-js` | ^2.75.0 | Low — actively maintained        |
| `react`                 | ^18.3.1 | Low — stable LTS                 |
| `vite`                  | ^7.2.0  | Low — latest major               |
| `zod`                   | ^4.3.0  | Low — well-audited               |
| `lovable-tagger`        | (dev)   | Low — dev-only, uncommon package |

No known critical CVEs in listed dependencies.

## CI/CD Security Assessment

| Check                        | Status                                                   |
| ---------------------------- | -------------------------------------------------------- |
| SLSA Level 3 provenance      | **PASS** — release workflow with Sigstore attestation    |
| SBOM generation              | **PASS** — CycloneDX + SPDX in release workflow          |
| Dependency scanning          | **PASS** — Grype daily scan + Dependabot                 |
| Minimal workflow permissions | **PASS** — scoped `contents: read`, `pages: write`       |
| No `pull_request_target`     | **PASS** — tests don't run on fork PRs with write access |
| Secrets handling             | **PASS** — uses GitHub secrets, not hardcoded            |

---

## Top 5 Prioritized Fixes

| Priority | Fix                                                                                 | Impact                                |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------- |
| **1**    | Enforce email domain restriction server-side (Supabase Auth settings or DB trigger) | Prevents unauthorized signups         |
| **2**    | Use `user_id` instead of `user_name` for identity checks                            | Prevents authorization bypass         |
| **3**    | Fail hard when Supabase is unconfigured in production                               | Prevents accidental insecure fallback |
| **4**    | Revoke `anon` access to `booking_availability` view                                 | Reduces information disclosure        |
| **5**    | Add CSP headers to `index.html`                                                     | XSS defense-in-depth                  |

---

## Checklist

| Check                          | Status   | Notes                                               |
| ------------------------------ | -------- | --------------------------------------------------- |
| Entry points identified        | **PASS** | 3 routes + direct Supabase API                      |
| Auth integration reviewed      | **PASS** | Supabase Auth, client-side domain check only        |
| Configuration files reviewed   | **PASS** | `.env.example` safe, `supabase/config.toml` minimal |
| Dependencies scanned           | **PASS** | No known critical CVEs                              |
| CI/CD security reviewed        | **PASS** | Strong supply chain (SLSA L3)                       |
| Data flow mapped               | **PASS** | SPA → Supabase REST API → PostgreSQL + RLS          |
| Server-side domain enforcement | **FAIL** | Client-side only                                    |
| CSP headers                    | **FAIL** | Not implemented                                     |
| Build artifacts in repo        | **FAIL** | `dist/` committed                                   |
