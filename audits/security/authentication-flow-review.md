# Authentication Flow Security Audit

**Date:** 2026-02-23
**Scope:** All authentication-related code, Supabase integration, RLS policies, session management
**Risk Score: 5.2 / 10** (Medium)

---

## 1. Authentication Architecture Overview

The application is a React SPA (hosted on GitHub Pages) that uses **Supabase Auth** as its identity provider. There is no custom backend -- all authentication and data access is mediated through the Supabase client SDK and Row-Level Security (RLS) policies on PostgreSQL.

**Auth flow:**

1. User visits `/auth` page (`src/pages/Auth.tsx`)
2. Login/Signup/Reset handled via `supabase.auth.signInWithPassword()`, `.signUp()`, `.resetPasswordForEmail()`
3. Session stored in `localStorage` by Supabase JS SDK (`persistSession: true`)
4. `useAuth` hook (`src/hooks/useAuth.tsx`) checks session on mount and listens to `onAuthStateChange`
5. `ProtectedRoute` (`src/components/ProtectedRoute.tsx`) gates access to `/` and `/statistics`
6. All database queries go through the Supabase client with JWT attached; RLS policies enforce authorization

**What Supabase handles server-side (not in codebase):**

- Password hashing (bcrypt)
- JWT issuance and validation
- Token refresh
- Email confirmation flow
- Rate limiting on auth endpoints (configurable)

---

## 2. Findings

### FINDING 1: Weak Password Policy

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Severity** | Medium                                                          |
| **CWE**      | CWE-521 (Weak Password Requirements)                            |
| **Evidence** | `src/services/authService.ts:14-16`, `src/pages/Auth.tsx:70-71` |

```typescript
// authService.ts:14
.min(6, 'Password must be at least 6 characters')
.max(72, 'Password must be less than 72 characters');

// Auth.tsx:70
if (!password || password.length < 6) {
```

**Why it matters:** A 6-character minimum with no complexity requirements allows trivially weak passwords like `123456`. NIST SP 800-63B recommends minimum 8 characters and checking against breached password lists.

**Remediation:**

```typescript
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be less than 72 characters')
  .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Must contain at least one digit');
```

Also configure minimum password length in Supabase dashboard (Auth > Settings).

---

### FINDING 2: Account Enumeration via Signup Error

|              |                                           |
| ------------ | ----------------------------------------- |
| **Severity** | Medium                                    |
| **CWE**      | CWE-204 (Observable Response Discrepancy) |
| **Evidence** | `src/services/authService.ts:119-124`     |

```typescript
if (error.message.includes('already registered')) {
  return {
    success: false,
    error: 'This email is already registered. Please log in instead.',
  };
}
```

**Why it matters:** Reveals whether a specific email address is registered. Enables enumeration of valid `@lht.dlh.de` addresses.

**Remediation:** Return generic message:

```typescript
return {
  success: false,
  error: 'If this email is eligible, a confirmation link has been sent.',
};
```

---

### FINDING 3: Raw Supabase Error Messages Exposed to Users

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Severity** | Low-Medium                                                                   |
| **CWE**      | CWE-209 (Error Message Containing Sensitive Information)                     |
| **Evidence** | `src/pages/Auth.tsx:101`, `src/pages/Auth.tsx:138`, `src/pages/Auth.tsx:169` |

```typescript
toast.error(error.message || 'Invalid email or password');
```

**Why it matters:** `Auth.tsx` calls `supabase.auth.*` directly (bypassing `AuthService`) and displays raw error messages which can include rate limit details, connection errors, or implementation-specific codes.

**Remediation:** Use `AuthService` methods or sanitize errors:

```typescript
toast.error('Invalid email or password');
console.error('Login error:', error.message);
```

---

### FINDING 4: Duplicate Auth Implementation (Dead Code Risk)

|              |                                                                    |
| ------------ | ------------------------------------------------------------------ |
| **Severity** | Medium (Architectural)                                             |
| **CWE**      | CWE-1164 (Irrelevant Code)                                         |
| **Evidence** | `src/pages/Auth.tsx:85-111` vs `src/services/authService.ts:61-95` |

`Auth.tsx` implements login/signup/reset by calling `supabase.auth.*` directly. `AuthService` provides the same operations with better error handling and Zod validation. **AuthService is never imported by Auth.tsx.**

Differences:

- Auth.tsx leaks raw error messages (Finding 3)
- Auth.tsx signup doesn't include `emailRedirectTo`; AuthService does
- Different email validation logic
- Security fixes applied to one may not be applied to the other

**Remediation:** Refactor `Auth.tsx` to delegate to `AuthService`.

---

### FINDING 5: Incomplete Password Reset Flow

|              |                                                          |
| ------------ | -------------------------------------------------------- |
| **Severity** | Medium                                                   |
| **CWE**      | CWE-640 (Weak Password Recovery Mechanism)               |
| **Evidence** | `src/pages/Auth.tsx:154-179`, `src/hooks/useAuth.tsx:26` |

The password reset **request** works (sends email). However, there is no UI to **complete** the reset. The `onAuthStateChange` listener ignores the `_event` parameter:

```typescript
// useAuth.tsx:26
supabase.auth.onAuthStateChange((_event, session) => {
  setUser(session?.user ?? null);
});
```

The `PASSWORD_RECOVERY` event is never detected. When a user clicks the reset link, they're redirected into the app as if logged in, never prompted to set a new password.

**Remediation:**

```typescript
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    navigate('/auth?mode=update-password');
    return;
  }
  setUser(session?.user ?? null);
});
```

---

### FINDING 6: Hardcoded Redirect URL in signOut

|              |                                             |
| ------------ | ------------------------------------------- |
| **Severity** | Low                                         |
| **CWE**      | CWE-601 (URL Redirection to Untrusted Site) |
| **Evidence** | `src/hooks/useAuth.tsx:39`                  |

```typescript
window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth';
```

Breaks local development. Uses `window.location.href` instead of React Router.

**Remediation:**

```typescript
window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
```

---

### FINDING 7: `booking_availability` View Granted to `anon` Role

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Severity** | Low-Medium                                                      |
| **CWE**      | CWE-284 (Improper Access Control)                               |
| **Evidence** | `supabase/migrations/20260102000001_fix_security_issues.sql:22` |

```sql
GRANT SELECT ON public.booking_availability TO anon, authenticated;
```

Anyone with the Supabase URL and anon key can query booking availability without authentication.

**Remediation:**

```sql
REVOKE SELECT ON public.booking_availability FROM anon;
```

---

### FINDING 8: `SECURITY DEFINER` Functions Broadly Accessible

|              |                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Low                                                                                                                         |
| **CWE**      | CWE-250 (Execution with Unnecessary Privileges)                                                                             |
| **Evidence** | Multiple migrations — `generate_recurring_bookings` (`20260103000004:78`), `refresh_booking_summary` (`20260103000006:159`) |

Both `SECURITY DEFINER` functions are `GRANT EXECUTE TO authenticated`. Any authenticated user can trigger recurring booking generation for all users, or force a materialized view refresh (DoS vector).

**Remediation:** Restrict to service role or add admin checks.

---

### FINDING 9: No Client-Side Rate Limiting on Auth Forms

|              |                                                           |
| ------------ | --------------------------------------------------------- |
| **Severity** | Low                                                       |
| **CWE**      | CWE-307 (Improper Restriction of Excessive Auth Attempts) |
| **Evidence** | `src/pages/Auth.tsx:85-111`                               |

No client-side throttling. The `isLoading` flag only blocks during active requests.

**Remediation:** Add exponential backoff after failed attempts:

```typescript
const [failedAttempts, setFailedAttempts] = useState(0);
const [lockoutUntil, setLockoutUntil] = useState<Date | null>(null);
```

---

### FINDING 10: `NotFound` Route Not Protected

|              |                  |
| ------------ | ---------------- |
| **Severity** | Informational    |
| **Evidence** | `src/App.tsx:49` |

Catch-all route renders without `ProtectedRoute`. Acceptable since it exposes no data, but reveals app branding/structure.

---

### FINDING 11: `refresh_booking_summary` DoS Vector

|              |                                                                  |
| ------------ | ---------------------------------------------------------------- |
| **Severity** | Low                                                              |
| **CWE**      | CWE-862 (Missing Authorization)                                  |
| **Evidence** | `supabase/migrations/20260103000006_v2_statistics_views.sql:159` |

`SECURITY DEFINER` function calls `REFRESH MATERIALIZED VIEW CONCURRENTLY`. Any authenticated user can trigger this expensive operation at will.

**Remediation:**

```sql
REVOKE EXECUTE ON FUNCTION public.refresh_booking_summary() FROM authenticated;
```

---

## 3. Checklist

| #   | Check Item                      | Status                | Notes                                                                  |
| --- | ------------------------------- | --------------------- | ---------------------------------------------------------------------- |
| 1   | Authentication implementation   | **PASS**              | Supabase Auth, no custom crypto                                        |
| 2   | Password handling (hashing)     | **PASS**              | Delegated to Supabase (bcrypt server-side)                             |
| 3   | Token/session management        | **PASS**              | JWTs in localStorage; `autoRefreshToken: true`, `persistSession: true` |
| 4   | Brute force protection          | **CONDITIONAL**       | Depends on Supabase dashboard config; no client-side throttling        |
| 5   | Account enumeration prevention  | **FAIL**              | Signup reveals existing emails                                         |
| 6   | CSRF protection                 | **N/A**               | SPA with JWT auth, no cookies for auth                                 |
| 7   | Mass assignment vulnerabilities | **PASS**              | Signup sends only email, password, user_name; RLS enforces             |
| 8   | Password reset flow             | **FAIL**              | Request works but no UI to complete reset                              |
| 9   | Session invalidation on logout  | **PASS**              | `signOut()` called; Supabase invalidates server-side                   |
| 10  | Multi-factor authentication     | **N/A**               | Not implemented                                                        |
| 11  | OAuth/social login              | **N/A**               | Not implemented                                                        |
| 12  | Token refresh mechanism         | **PASS**              | `autoRefreshToken: true` in client config                              |
| 13  | Auth state management           | **PASS** with caveats | `useAuth` hook works but ignores `_event` (breaks password recovery)   |

---

## 4. Top 5 Prioritized Fixes

| Priority | Finding                                                                                                   | Severity   | Effort |
| -------- | --------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| **1**    | F5: Complete password reset flow — handle `PASSWORD_RECOVERY` event, add new-password form                | Medium     | Low    |
| **2**    | F4: Refactor `Auth.tsx` to use `AuthService` for consistent error handling and validation                 | Medium     | Low    |
| **3**    | F1: Strengthen password policy to 8+ chars with complexity, both client and server                        | Medium     | Low    |
| **4**    | F2: Return generic messages on signup/login errors to prevent enumeration                                 | Medium     | Low    |
| **5**    | F8: Restrict `generate_recurring_bookings` and `refresh_booking_summary` from general authenticated users | Low-Medium | Low    |

---

## 5. Positive Observations

- RLS enabled on all tables with proper `auth.uid()` checks
- Views use `security_invoker = true` after deliberate migration fixes
- Materialized view API exposure was fixed by revoking direct access
- SECURITY DEFINER functions all set `search_path`
- Email domain restriction exists (client-side only, but present)
- Zod validation schemas exist in `authService.ts`
- `.env` files in `.gitignore`; no secrets committed
- `detectSessionInUrl: true` configured for OAuth/magic link flows
