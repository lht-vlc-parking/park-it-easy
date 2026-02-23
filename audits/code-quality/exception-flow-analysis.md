# Exception Flow Analysis Audit

**Date:** 2026-02-23
**Scope:** Full `src/` directory
**Version:** park-it-easy-office v2.3.3
**Risk Score: 6.5 / 10**

> Moderate-to-high risk. The application handles "happy path" errors reasonably well (Supabase API errors surface as toasts), but has systemic gaps: no request timeouts, no retry logic, no global error interception for unhandled promise rejections, silent fallbacks that mask outages, and a completely unconfigured React Query client that provides no error recovery defaults.

---

## Error Flow Diagrams

### Path 1: Supabase Unavailable (Connection Failure / DNS / Service Down)

```
[supabase.from('bookings').select()]
    → JS fetch() throws TypeError ("Failed to fetch")
    → [catch block in fetchBookings()]     ← src/pages/Index.tsx:64
    → console.error() + toast.error("Failed to load bookings")
    → [User sees] red toast: "Failed to load bookings"
    → [State] loading set to false, bookings = [] (stale empty)
    → [Recovery] NONE — no retry, no refetch, page stuck empty

Special case: Supabase env vars missing
    → isSupabaseConfigured = false           ← src/integrations/supabase/client.ts:8
    → Mock client returns { data: null, error: null } for queries
    → [User sees] Auth.tsx shows "Configuration Required" alert
    → [Hooks] useParkingSpots falls back to hardcoded spots (84, 85)
    → [Other hooks] return empty arrays silently — NO user notification
```

**Gaps identified:**

- Mock client at `client.ts:20-28` only mocks `auth.*` methods. Any `.from()` call on the mock will crash (`supabase.from is not a function`) since the mock doesn't implement the data API.
- No global `window.addEventListener('unhandledrejection')` handler.
- No network connectivity detection or offline banner.

---

### Path 2: Supabase Request Timeout (Slow Network / Long Query)

```
[supabase.from('bookings').select()]
    → Supabase JS client uses fetch() with NO timeout configured
    → [Waits indefinitely] — browser default timeout (varies, often 300s)
    → Eventually: TypeError or AbortError
    → Falls into same catch blocks as Path 1
    → [User sees] spinner indefinitely, then eventual toast
    → [State] UI stuck in loading state for potentially minutes

Specific locations with no timeout protection:
    - src/pages/Index.tsx:45          (fetchBookings)
    - src/pages/Statistics.tsx:63     (fetchBookings)
    - src/hooks/useStatistics.ts:48   (5 parallel requests via Promise.all)
    - src/hooks/useParkingSpots.ts:26 (2 parallel requests via Promise.all)
    - src/hooks/useRecurringBookings.ts:22
    - src/hooks/useWaitlist.ts:28
    - src/hooks/useBookingAudit.ts:20
    - src/hooks/useUserProfile.ts:19
```

**Gaps identified:**

- Supabase client at `client.ts:13` sets no `global.fetch` override, no `db.timeout`, no `AbortController`.
- `Promise.all` in `useStatistics.ts:48` and `useParkingSpots.ts:26` means one slow request blocks all.
- No loading timeout (e.g., "still loading..." fallback after 10s).

---

### Path 3: Invalid User Input (Form Validation / Booking Conflicts)

```
[User submits booking form]
    → Client-side validation in BookingDialogWithValidation.tsx
        → No date?      → toast.error("Please select a date")       :56
        → No user?      → toast.error("You must be logged in")      :61
    → Server-side pre-check queries:
        → Duplicate user booking check                               :71-86
        → Spot conflict check (car overlap)                          :109-122
        → Motorcycle capacity check (max 4)                          :125-152
    → If conflict → toast.error(specific message), return early
    → If validation passes → onConfirm() called → Index.tsx:77
    → Second round: supabase.from('bookings').insert()
    → If DB constraint error → toast.error(error.message)            :96-97

Auth.tsx validation (separate, not shared with AuthService):
    → validateEmail()    → domain check @lht.dlh.de                  :53-67
    → validatePassword() → min 6 chars                               :69-75
    → validateName()     → non-empty                                 :77-83
    → All use toast.error() for feedback
    → [State] isLoading reset in finally{} block — consistent
```

**Gaps identified:**

- **Double validation, double insert risk**: `BookingDialogWithValidation.tsx` validates and calls `onConfirm()`, which calls `handleConfirmBooking()` in `Index.tsx:77` that does the insert. Between validation and insert, another user could book the same slot (TOCTOU race condition). No database-level unique constraint is verified client-side.
- Auth.tsx validation (`src/pages/Auth.tsx:53-83`) duplicates logic from `AuthService` (`src/services/authService.ts:5-22`) — the service's Zod schemas are never used by the actual Auth page.
- `RadioGroup` `onValueChange` uses `as` cast (`v as 'car' | 'motorcycle'`) at `BookingDialogWithValidation.tsx:223` and `:280` — bypasses type safety. The runtime type guards `isDuration`/`isVehicleType` (:22-28) are only used for DB data, not for form inputs.

---

### Path 4: Authentication Failure (Login / Expired Session / Token Refresh)

```
[Login attempt — wrong credentials]
    → supabase.auth.signInWithPassword()
    → Returns { error: AuthApiError }
    → Auth.tsx:100 — if (error) toast.error(error.message)
    → [User sees] "Invalid login credentials" toast
    → [State] isLoading = false via finally{}

[Session expired — token refresh failure]
    → Supabase JS client autoRefreshToken: true            ← client.ts:15
    → Token refresh happens transparently
    → On failure: onAuthStateChange fires with session=null
    → useAuth.tsx:26 — setUser(null)
    → ProtectedRoute.tsx:20 — !user → Navigate to /auth
    → [User sees] redirected to login page silently — NO explanation toast

[signOut error]
    → useAuth.tsx:37 — await supabase.auth.signOut()
    → NO try/catch — if signOut throws, unhandled rejection
    → Hard redirect to external URL regardless: line 39
    → window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth'

[Session check on page load]
    → Auth.tsx:30-36 — checkSession() has NO .catch()
    → If Supabase is down during initial load, unhandled rejection
    → useAuth.tsx:16-22 — getSession() HAS .catch() — logs + sets loading=false
```

**Gaps identified:**

- `Auth.tsx:30-36` `checkSession()` is missing `.catch()` — any network error is an unhandled promise rejection.
- `signOut()` in `useAuth.tsx:34-40` has no try/catch and no error toast.
- Hard-coded redirect URL in `signOut()` (`https://miguel11nines.github.io/park-it-easy-office/auth`) breaks in any non-GitHub-Pages environment.
- No "Session expired" notification — user is silently dumped to login.
- `ProtectedRoute` has no error state — if `useAuth` throws during the loading phase, the ErrorBoundary catches it, but user gets generic "Something went wrong" instead of "Please log in again."

---

### Path 5: Missing Data / Not Found (Missing Spots, Bookings, Profiles)

```
[User profile not found]
    → useUserProfile.ts:25 — error from .single()
    → console.warn("Profile not found, may be created on next auth event")  :27
    → profile remains null
    → [User sees] NOTHING — profile data silently missing from UI
    → [State] loading=false, profile=null — components must null-check

[Booking audit not found / empty]
    → useBookingAudit.ts:27-28 — if error: console.warn, data stays []
    → [User sees] empty audit history — acceptable

[Statistics views missing (DB views not created)]
    → useStatistics.ts:57-63 — each view error is console.warn'd independently
    → Data falls back to empty arrays
    → Statistics.tsx uses client-side calculations as fallback
    → [User sees] client-computed stats — graceful degradation

[Fairness score — single row not found]
    → useStatistics.ts:59 — PGRST116 error code explicitly ignored (no row)
    → Falls back to null → client calculates fairness score
    → Good error handling pattern

[Parking spots missing from DB]
    → useParkingSpots.ts:38-44 — falls back to hardcoded spots [84, 85]
    → [User sees] spots still render — graceful fallback
    → console.warn logged

[Booking references deleted spot]
    → No referential integrity check client-side
    → Bookings reference spot_number directly, no FK validation
    → If spot deleted from DB, bookings still display
```

---

## Anti-Patterns Found

### AP1 — Unconfigured React Query Client

|                |                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Critical**                                                                                                                                                                                                                                                                                                                                                                              |
| **Importance** | 9/10                                                                                                                                                                                                                                                                                                                                                                                      |
| **Evidence**   | `src/App.tsx:14`                                                                                                                                                                                                                                                                                                                                                                          |
| **What**       | `new QueryClient()` with zero configuration — no `defaultOptions` for `staleTime`, `retry`, `retryDelay`, `onError`, or `gcTime`. React Query defaults to 3 retries with exponential backoff, but since the app uses manual `useEffect` + `useState` patterns instead of `useQuery`, the QueryClient is essentially dead code. The provider wraps the entire app but no hook consumes it. |

**Remediation:**
Either remove React Query entirely (it's unused), or migrate hooks to use it:

```tsx
// src/App.tsx — If keeping React Query, configure it:
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10000),
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
      onError: error => {
        console.error('Mutation error:', error);
        toast.error('Operation failed. Please try again.');
      },
    },
  },
});
```

---

### AP2 — Missing `.catch()` on Auth Session Check

|                |                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | **High**                                                                                                                                                                                                                                         |
| **Importance** | 8/10                                                                                                                                                                                                                                             |
| **Evidence**   | `src/pages/Auth.tsx:30-36`                                                                                                                                                                                                                       |
| **What**       | `checkSession()` is an async function called without `.catch()`. If Supabase is unreachable, this produces an unhandled promise rejection that crashes the auth page silently (no ErrorBoundary catches promise rejections, only render errors). |

**Remediation:**

```tsx
// src/pages/Auth.tsx — add .catch() to checkSession
const checkSession = async () => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (mounted && session) {
      navigate('/');
    }
  } catch (error) {
    console.error('Failed to check session:', error);
    // Optionally show toast if not the initial page load
  }
};
checkSession();
```

---

### AP3 — signOut Has No Error Handling

|                |                                                                                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **High**                                                                                                                                                                                                                                                          |
| **Importance** | 7/10                                                                                                                                                                                                                                                              |
| **Evidence**   | `src/hooks/useAuth.tsx:34-40`                                                                                                                                                                                                                                     |
| **What**       | `signOut()` awaits `supabase.auth.signOut()` with no try/catch. If the request fails, the hard redirect on line 39 still executes, potentially leaving the local session in an inconsistent state (server thinks user is still signed in, client navigated away). |

**Remediation:**

```tsx
const signOut = async () => {
  if (!isSupabaseConfigured) return;

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
      // Still redirect — user clearly wants to leave
    }
  } catch (error) {
    console.error('Sign out failed:', error);
  }
  window.location.href = `${window.location.origin}/park-it-easy-office/auth`;
};
```

---

### AP4 — Mock Supabase Client is Incomplete (Crash Vector)

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Critical**                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Importance** | 8/10                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Evidence**   | `src/integrations/supabase/client.ts:20-28`                                                                                                                                                                                                                                                                                                                                                                                              |
| **What**       | When `isSupabaseConfigured` is false, the mock object only stubs `auth.*` methods. Any code calling `supabase.from('bookings')` (e.g., `Index.tsx:45`, `Statistics.tsx:63`) will crash with `TypeError: supabase.from is not a function`. The `useParkingSpots` and `useRecurringBookings` hooks check `isSupabaseConfigured` before calling `.from()`, but `Index.tsx`, `Statistics.tsx`, and `BookingDialogWithValidation.tsx` do NOT. |

**Remediation:**

```ts
// src/integrations/supabase/client.ts — add minimal .from() mock
: ({
    auth: { /* existing mocks */ },
    from: () => ({
      select: () => ({ data: null, error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' }, eq: () => ({ data: null, error: null }) }),
      insert: () => ({ data: null, error: { message: 'Supabase not configured' } }),
      update: () => ({ data: null, error: { message: 'Supabase not configured' } }),
      delete: () => ({ data: null, error: { message: 'Supabase not configured' } }),
    }),
  } as unknown as SupabaseClient<Database>);
```

Better: guard all `.from()` calls with `isSupabaseConfigured` checks, as some hooks already do.

---

### AP5 — No Request Timeout or AbortController

|                |                                                                                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **High**                                                                                                                                                                                                                                                |
| **Importance** | 7/10                                                                                                                                                                                                                                                    |
| **Evidence**   | All hooks in `src/hooks/`, `src/pages/Index.tsx`, `src/pages/Statistics.tsx`                                                                                                                                                                            |
| **What**       | No Supabase request has a timeout. On a degraded network, the UI shows a spinner indefinitely. `Promise.all` in `useStatistics.ts:48` (5 parallel queries) and `useParkingSpots.ts:26` (2 parallel queries) means one stuck request blocks all results. |

**Remediation:**

```ts
// Utility: Supabase query with timeout
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number = 10_000,
  errorMessage = 'Request timed out'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(errorMessage)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Usage in hooks:
const { data, error } = await withTimeout(supabase.from('bookings').select('*'), 10_000);
```

---

### AP6 — Dual Toast Systems

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Importance** | 5/10                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Evidence**   | `src/App.tsx:1-2`, `src/components/ui/sonner.tsx`, `src/hooks/use-toast.ts`                                                                                                                                                                                                                                                                                                                                                                                |
| **What**       | Two toast systems are mounted simultaneously: Radix-based `<Toaster />` from `use-toast.ts` AND Sonner `<Sonner />` from `sonner.tsx`. All application code uses `toast` from `sonner`, but the Radix `<Toaster />` and `use-toast.ts` infrastructure is dead code. Errors displayed via `use-toast`'s `toast()` would appear in a different location/style than the Sonner toasts used everywhere else, creating inconsistency if ever accidentally used. |

**Remediation:**
Remove the unused Radix toast system:

```tsx
// src/App.tsx — remove:
import { Toaster } from '@/components/ui/toaster';
// and remove <Toaster /> from JSX
```

---

### AP7 — TOCTOU Race in Booking Validation

|                |                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | **High**                                                                                                                                                                                                                                                                                                                                         |
| **Importance** | 8/10                                                                                                                                                                                                                                                                                                                                             |
| **Evidence**   | `src/components/BookingDialogWithValidation.tsx:69-166` + `src/pages/Index.tsx:77-108`                                                                                                                                                                                                                                                           |
| **What**       | Booking validation (conflict check) and booking creation are two separate Supabase calls with no transaction or server-side constraint. Between the validation query completing and the insert executing, another user can book the same slot. The validation is purely advisory. This is a Time-of-Check-to-Time-of-Use (TOCTOU) vulnerability. |

**Remediation:**
Move validation into a PostgreSQL function or add a unique constraint:

```sql
-- Database-level constraint (preferred)
ALTER TABLE bookings ADD CONSTRAINT unique_car_booking
  EXCLUDE USING gist (
    spot_number WITH =,
    date WITH =,
    duration WITH =
  ) WHERE (vehicle_type = 'car');
```

Client-side: handle the constraint violation error from the insert, rather than pre-checking.

---

### AP8 — Error Information Lost in Catch Blocks

|                |                                                                                                                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Medium**                                                                                                                                                                                                                                                                                           |
| **Importance** | 6/10                                                                                                                                                                                                                                                                                                 |
| **Evidence**   | `src/pages/Auth.tsx:106,147,174`                                                                                                                                                                                                                                                                     |
| **What**       | Three catch blocks use `catch (_error)` (underscore-prefixed, never used) and show a generic "Failed to connect. Please try again." toast. The actual error (network, CORS, rate limit, etc.) is discarded entirely — not even logged to console. This makes debugging production issues impossible. |

**Remediation:**

```tsx
} catch (error) {
  console.error('Login failed:', error);
  const message = error instanceof Error
    ? error.message
    : 'Failed to connect. Please try again.';
  toast.error(message);
}
```

---

### AP9 — No Unhandled Promise Rejection Handler

|                |                                                                                                                                                                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Medium**                                                                                                                                                                                                                                                                             |
| **Importance** | 6/10                                                                                                                                                                                                                                                                                   |
| **Evidence**   | Absence in entire `src/` directory                                                                                                                                                                                                                                                     |
| **What**       | No `window.addEventListener('unhandledrejection')` handler exists. React's ErrorBoundary (`src/components/ErrorBoundary.tsx`) only catches synchronous render errors. Any unhandled async error (e.g., the Auth.tsx session check) silently fails with only a browser console warning. |

**Remediation:**

```ts
// src/main.tsx or src/App.tsx — add global handler
window.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection:', event.reason);
  // Optional: send to error tracking service
  // toast.error('An unexpected error occurred');
});
```

---

### AP10 — Services Layer is Dead Code with Better Patterns

|                |                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Low**                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Importance** | 4/10                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Evidence**   | `src/services/authService.ts`, `src/services/bookingService.ts`                                                                                                                                                                                                                                                                                                                                                                   |
| **What**       | `AuthService` and `BookingService` implement proper Zod validation, structured error returns (`AuthResult`/`BookingResult`), and centralized error handling — but are never imported by any component or hook. `Auth.tsx` reimplements validation with inline functions. `Index.tsx` and `BookingDialogWithValidation.tsx` do raw Supabase calls. This is dead code with superior error handling patterns that should be adopted. |

**Remediation:**
Either integrate the services or delete them. To integrate:

```tsx
// Auth.tsx — replace inline validation with:
import { AuthService } from '@/services/authService';

const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  const result = await AuthService.signIn({ email: loginEmail, password: loginPassword });
  if (result.success) {
    toast.success('Welcome back!');
    navigate('/');
  } else {
    toast.error(result.error || 'Login failed');
  }
  setIsLoading(false);
};
```

---

## Findings

### F1 — ErrorBoundary Scope is Correct but Limited

**Location:** `src/components/ErrorBoundary.tsx`, `src/App.tsx:17-55`
**Severity:** Medium | **Importance:** 5/10

The single `ErrorBoundary` wraps the entire application at the top level (`App.tsx:17`), which is correct for a last-resort catch. However:

1. **No granular boundaries** — a render error in `Statistics.tsx` takes down the entire app including navigation. Individual route-level boundaries would allow partial degradation.
2. **Production error details hidden** — `process.env.NODE_ENV === 'development'` check at line 73 hides stack traces in prod. While correct for security, there's no error ID or reference number for support requests.
3. **Reset navigates via `window.location.href`** (line 50) — this does a full page reload, which is appropriate for recovery but loses all React state and forces re-authentication.
4. **TODO on line 44** — Sentry integration is not implemented. Errors in production are effectively invisible to developers.

---

### F2 — Console-Only Logging Strategy

**Location:** All hooks and pages
**Severity:** Medium | **Importance:** 6/10

Every error path uses `console.error()` or `console.warn()` exclusively. In production:

- Console logs are not persisted
- No error tracking service (Sentry TODO at `ErrorBoundary.tsx:44`)
- No structured logging format
- No error correlation (each log is independent, no request IDs)

Error logging inventory:
| Pattern | Count | Files |
|---------|-------|-------|
| `console.error(string, error)` | 18 | All hooks, pages, services |
| `console.warn(string, error)` | 7 | useParkingSpots, useRecurringBookings, useWaitlist, useBookingAudit, useStatistics, useUserProfile |
| `console.error(string)` (404 page) | 1 | NotFound.tsx:11 |
| Errors discarded (`_error`) | 3 | Auth.tsx:106,147,174 |

---

### F3 — Inconsistent Error Handling Patterns Across Hooks

**Location:** `src/hooks/`
**Severity:** Medium | **Importance:** 5/10

Three distinct patterns coexist:

**Pattern A — "warn and continue"** (useParkingSpots, useRecurringBookings fetch, useWaitlist fetch, useBookingAudit, useStatistics view queries):

```
if (error) { console.warn(...); } else { setData(data); }
```

User sees nothing. Data stays empty/stale.

**Pattern B — "throw and toast"** (useRecurringBookings mutate, useWaitlist mutate, useUserProfile mutate):

```
if (error) throw error;
// ...
catch (err) { console.error(...); toast.error(...); return false; }
```

User sees toast. State unchanged.

**Pattern C — "error + toast in both branches"** (Index.tsx fetchBookings, Statistics.tsx fetchBookings):

```
if (error) throw error;
// ...
catch (error) { console.error(...); toast.error(...); }
```

Converts Supabase error object to thrown error (loses `.code`, `.details`, `.hint`). User sees toast.

---

### F4 — Hard-Coded External URL in signOut

**Location:** `src/hooks/useAuth.tsx:39`
**Severity:** Medium | **Importance:** 5/10

```ts
window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth';
```

This hard-coded URL:

- Breaks in any environment except the specific GitHub Pages deployment
- Breaks in development (`localhost:5173`)
- Is not derived from `window.location.origin` or `import.meta.env.BASE_URL`
- Contradicts the `getAuthRedirectUrl()` helper in `authService.ts:40-51` which correctly constructs the URL dynamically

---

### F5 — Statistics Page Missing User Guard for fetchBookings

**Location:** `src/pages/Statistics.tsx:56-57`
**Severity:** Low | **Importance:** 3/10

```tsx
useEffect(() => {
  fetchBookings();
}, []);
```

Unlike `Index.tsx:33-38` which checks `if (user)` before fetching, `Statistics.tsx` calls `fetchBookings()` unconditionally on mount. Since it's wrapped in `ProtectedRoute`, `user` should always exist, but if auth state is still loading, this fires before the user is confirmed. It also lacks `fetchBookings` in the dependency array (stale closure risk).

---

### F6 — `env.ts` is Defined But Not Used by `client.ts`

**Location:** `src/lib/env.ts`, `src/integrations/supabase/client.ts:4-5`
**Severity:** Low | **Importance:** 3/10

`env.ts` provides Zod-validated environment variables and exports `isSupabaseConfigured`. However, `client.ts` reads `import.meta.env` directly (lines 4-5) and has its own `isSupabaseConfigured` export (line 8). Two separate sources of truth for the same check. `client.ts` should import from `env.ts`:

```ts
// client.ts — should be:
import { env, isSupabaseConfigured } from '@/lib/env';
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

---

### F7 — No Retry Logic Anywhere

**Location:** Entire `src/` directory
**Severity:** Medium | **Importance:** 6/10

Zero retry mechanisms exist:

- No `react-query` `useQuery` usage (despite the library being installed)
- No custom retry wrappers
- No exponential backoff
- No "retry" button on error states (except the global ErrorBoundary "Reload Page")

Transient network errors (common on mobile) cause permanent failure states until full page reload.

---

## Standardized Error Handling Template

Recommended standard for all Supabase operations in this codebase:

```typescript
// src/lib/supabase-utils.ts

import { PostgrestError } from '@supabase/supabase-js';
import { toast } from 'sonner';

/** Timeout wrapper for any promise */
export function withTimeout<T>(promise: Promise<T>, ms = 10_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms)),
  ]);
}

/** Standard result type for all Supabase operations */
interface SupabaseResult<T> {
  data: T | null;
  error: string | null;
}

/** Standard query handler — use for all SELECT operations */
export async function safeQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  options: {
    errorMessage?: string;
    showToast?: boolean;
    timeout?: number;
  } = {}
): Promise<SupabaseResult<T>> {
  const { errorMessage = 'Failed to load data', showToast = false, timeout = 10_000 } = options;

  try {
    const { data, error } = await withTimeout(queryFn(), timeout);

    if (error) {
      console.error(`[Supabase Query Error] ${error.code}: ${error.message}`, {
        details: error.details,
        hint: error.hint,
      });
      if (showToast) toast.error(errorMessage);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Supabase Query Exception] ${message}`, err);
    if (showToast)
      toast.error(
        message === 'Request timed out'
          ? 'Request timed out. Please check your connection.'
          : errorMessage
      );
    return { data: null, error: message };
  }
}

/** Standard mutation handler — use for INSERT/UPDATE/DELETE */
export async function safeMutation<T>(
  mutationFn: () => Promise<{ data: T | null; error: PostgrestError | null }>,
  options: {
    successMessage?: string;
    errorMessage?: string;
    timeout?: number;
  } = {}
): Promise<SupabaseResult<T>> {
  const { successMessage, errorMessage = 'Operation failed', timeout = 15_000 } = options;

  try {
    const { data, error } = await withTimeout(mutationFn(), timeout);

    if (error) {
      console.error(`[Supabase Mutation Error] ${error.code}: ${error.message}`, {
        details: error.details,
        hint: error.hint,
      });

      // Map common Postgres error codes to user-friendly messages
      const userMessage = mapPostgresError(error) || errorMessage;
      toast.error(userMessage);
      return { data: null, error: error.message };
    }

    if (successMessage) toast.success(successMessage);
    return { data, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Supabase Mutation Exception] ${message}`, err);
    toast.error(
      message === 'Request timed out' ? 'Request timed out. Please try again.' : errorMessage
    );
    return { data: null, error: message };
  }
}

function mapPostgresError(error: PostgrestError): string | null {
  switch (error.code) {
    case '23505':
      return 'This record already exists';
    case '23503':
      return 'Referenced record not found';
    case '42501':
      return 'You do not have permission for this action';
    case 'PGRST301':
      return 'Session expired. Please log in again.';
    default:
      return null;
  }
}
```

**Usage example:**

```typescript
// In a hook — replaces manual try/catch pattern
const fetchBookings = async () => {
  const { data, error } = await safeQuery(
    () => supabase.from('bookings').select('*').order('date', { ascending: true }),
    { errorMessage: 'Failed to load bookings', showToast: true }
  );
  if (data) setBookings(transformBookings(data));
  setLoading(false);
};
```

---

## Top 5 Prioritized Fixes

### 1. Fix the Incomplete Mock Supabase Client (AP4) — **Critical**

**Why:** Any deployment without env vars crashes the entire app. The mock only covers `auth.*` but multiple components call `supabase.from()` without checking `isSupabaseConfigured`.
**Effort:** Small (1 hour)
**Fix:** Either add `.from()` to the mock, or add `isSupabaseConfigured` guards in `Index.tsx`, `Statistics.tsx`, and `BookingDialogWithValidation.tsx`.

### 2. Add `.catch()` to Auth Session Check + signOut Error Handling (AP2 + AP3) — **High**

**Why:** Two unhandled promise rejection vectors on the most critical user paths (page load + logout). These will crash silently in production.
**Effort:** Small (30 min)
**Fix:** Add try/catch as shown in AP2 and AP3 remediation above.

### 3. Add Request Timeouts (AP5) — **High**

**Why:** Any Supabase degradation leaves users staring at infinite spinners. The `Promise.all` in `useStatistics.ts` (5 parallel requests) is especially vulnerable — one slow view query blocks the entire statistics page.
**Effort:** Medium (2-3 hours)
**Fix:** Implement the `withTimeout()` utility from the template above and wrap all Supabase calls.

### 4. Integrate or Delete Dead Services Layer (AP10) + Unify Validation (AP8) — **Medium**

**Why:** `AuthService` and `BookingService` have strictly better error handling than the code that actually runs. Integrating them eliminates the discarded-error anti-pattern in `Auth.tsx` and the validation duplication. Consolidates three error handling patterns into one.
**Effort:** Medium (3-4 hours)
**Fix:** Wire `Auth.tsx` to use `AuthService`, wire `Index.tsx`/`BookingDialogWithValidation.tsx` to use `BookingService`.

### 5. Add Global Unhandled Rejection Handler + Error Tracking (AP9 + F2) — **Medium**

**Why:** Production errors are currently invisible. Console.error is the only logging, and the Sentry TODO has been pending since initial development. Combined with the unhandled rejection handler, this provides a safety net for all the async gaps.
**Effort:** Medium (2 hours for handler, half-day for Sentry integration)
**Fix:** Add `window.addEventListener('unhandledrejection')` and configure an error tracking service.

---

## Summary Matrix

| ID   | Issue                                | Severity | Importance | Fix Effort |
| ---- | ------------------------------------ | -------- | ---------- | ---------- |
| AP1  | Unconfigured React Query (dead code) | Critical | 9/10       | Small      |
| AP2  | Missing .catch() on session check    | High     | 8/10       | Small      |
| AP3  | signOut has no error handling        | High     | 7/10       | Small      |
| AP4  | Incomplete mock Supabase client      | Critical | 8/10       | Small      |
| AP5  | No request timeouts                  | High     | 7/10       | Medium     |
| AP6  | Dual toast systems                   | Medium   | 5/10       | Small      |
| AP7  | TOCTOU race in booking               | High     | 8/10       | Large      |
| AP8  | Errors discarded in Auth.tsx catches | Medium   | 6/10       | Small      |
| AP9  | No unhandled rejection handler       | Medium   | 6/10       | Small      |
| AP10 | Dead services with better patterns   | Low      | 4/10       | Medium     |
| F1   | ErrorBoundary scope limited          | Medium   | 5/10       | Medium     |
| F2   | Console-only logging                 | Medium   | 6/10       | Medium     |
| F3   | Inconsistent error patterns          | Medium   | 5/10       | Large      |
| F4   | Hard-coded signOut URL               | Medium   | 5/10       | Small      |
| F5   | Stats page missing user guard        | Low      | 3/10       | Small      |
| F6   | Duplicate isSupabaseConfigured       | Low      | 3/10       | Small      |
| F7   | No retry logic anywhere              | Medium   | 6/10       | Medium     |
