# Error Handling & Resilience Audit

**Date:** 2026-02-23
**Scope:** Full `src/` directory
**Version:** park-it-easy-office v2.3.3
**Risk Score: 6.2 / 10**

The application has basic error handling in place (try/catch in async operations, toast notifications for users), but suffers from a broken ErrorBoundary dev-mode gate, dual toast systems, no global unhandled-rejection catcher, zero retry logic, and a dead service layer whose superior error handling is never invoked.

---

## Findings

### F1 -- ErrorBoundary dev-mode check is broken (process.env.NODE_ENV in Vite)

|                    |                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                                                                                                                                                                                                                                                                                  |
| **Importance**     | 9/10                                                                                                                                                                                                                                                                                                                          |
| **Evidence**       | `src/components/ErrorBoundary.tsx:73`                                                                                                                                                                                                                                                                                         |
| **What**           | The ErrorBoundary uses `process.env.NODE_ENV === 'development'` to gate the display of error details (stack traces, component stacks). In Vite, `process.env.NODE_ENV` is always `undefined`; Vite uses `import.meta.env.MODE` instead.                                                                                       |
| **Why it matters** | The dev-mode error detail panel **never renders**, even in development. Developers get the same opaque "Something went wrong" message as production users, making debugging significantly harder. There is no information leakage risk (details are hidden everywhere), but the intended dev experience is completely broken. |

**Remediation:**

```tsx
// src/components/ErrorBoundary.tsx:73
// Before (broken):
{process.env.NODE_ENV === 'development' && this.state.error && (

// After (fixed):
{import.meta.env.DEV && this.state.error && (
```

`import.meta.env.DEV` is a Vite built-in boolean that is `true` in dev and `false` in production builds.

---

### F2 -- Dual toast systems mounted simultaneously

|                    |                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                          |
| **Importance**     | 7/10                                                                                                                                                                                                                                                                                                                                                                              |
| **Evidence**       | `src/App.tsx:27-28`                                                                                                                                                                                                                                                                                                                                                               |
| **What**           | Both `<Toaster />` (shadcn/radix via `src/components/ui/toaster.tsx` + `src/hooks/use-toast.ts`) and `<Sonner />` (sonner via `src/components/ui/sonner.tsx`) are mounted side-by-side. All application code imports `toast` from `'sonner'`, meaning the shadcn `<Toaster>` never displays anything -- it is dead code.                                                          |
| **Why it matters** | (1) Dead code increases bundle size and maintenance confusion. (2) If anyone imports from the shadcn `use-toast` path by mistake, errors would appear in a different toast system with different styling, or potentially both would fire. (3) The shadcn `use-toast.ts` has a `TOAST_REMOVE_DELAY` of 1,000,000ms (~16 minutes) which would cause ghost toasts if ever triggered. |

**Remediation:**

```tsx
// src/App.tsx -- remove the shadcn Toaster
- import { Toaster } from '@/components/ui/toaster';
  import { Toaster as Sonner } from '@/components/ui/sonner';
  ...
- <Toaster />
  <Sonner />

// Then delete these dead files:
// - src/components/ui/toaster.tsx
// - src/hooks/use-toast.ts
// - src/components/ui/use-toast.ts
```

---

### F3 -- No global unhandled promise rejection handler

|                    |                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                         |
| **Importance**     | 8/10                                                                                                                                                                                                                                                                                                                             |
| **Evidence**       | `src/main.tsx` (entire file, 5 lines -- no handler)                                                                                                                                                                                                                                                                              |
| **What**           | There is no `window.addEventListener('unhandledrejection', ...)` or `window.onerror` handler. The only safety net is the React ErrorBoundary, which does **not** catch async errors (unhandled rejections from `async/await` or `.then()`).                                                                                      |
| **Why it matters** | If any async operation throws outside a try/catch (or a `.then()` chain rejects without `.catch()`), the error silently vanishes. The user sees no feedback, and no telemetry is captured. This is especially dangerous given that `useAuth.signOut()` at `src/hooks/useAuth.tsx:37` has an unguarded `await` with no try/catch. |

**Remediation:**

```tsx
// src/main.tsx
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global safety net for uncaught async errors
window.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection:', event.reason);
  // TODO: send to error tracking service
});

window.addEventListener('error', event => {
  console.error('Uncaught error:', event.error);
});

createRoot(document.getElementById('root')!).render(<App />);
```

---

### F4 -- signOut() has no try/catch

|                    |                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                          |
| **Importance**     | 7/10                                                                                                                                                                                                                              |
| **Evidence**       | `src/hooks/useAuth.tsx:34-40`                                                                                                                                                                                                     |
| **What**           | `signOut` is an `async` function that calls `await supabase.auth.signOut()` followed by a hard redirect, but has no try/catch. If the Supabase call throws (network error, token refresh failure), the promise rejects unhandled. |
| **Why it matters** | A network outage during sign-out would leave the user stuck with no feedback and a console error at best.                                                                                                                         |

**Remediation:**

```tsx
const signOut = async () => {
  if (!isSupabaseConfigured) return;
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Sign out failed:', error);
    // Still redirect -- the session cookie is local
  }
  window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth';
};
```

---

### F5 -- Auth.tsx checkSession() has no error handling

|                    |                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                          |
| **Importance**     | 6/10                                                                                                                                                                                                                                                |
| **Evidence**       | `src/pages/Auth.tsx:29-37`                                                                                                                                                                                                                          |
| **What**           | `checkSession` calls `await supabase.auth.getSession()` but only destructures the success path. If the Supabase call throws, there is no catch, so it becomes an unhandled rejection. Compare with `useAuth.tsx:16-22` which does handle this case. |
| **Why it matters** | On the auth page specifically, a failed session check should silently allow the login form to display. Instead, it could throw and leave the page in an undefined state.                                                                            |

**Remediation:**

```tsx
const checkSession = async () => {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (mounted && session) {
      navigate('/');
    }
  } catch (error) {
    console.error('Session check failed:', error);
    // Allow login form to show
  }
};
```

---

### F6 -- TanStack Query configured with no error/retry defaults

|                    |                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                          |
| **Importance**     | 7/10                                                                                                                                                                                                                                                                                                                                                                                                |
| **Evidence**       | `src/App.tsx:14`                                                                                                                                                                                                                                                                                                                                                                                    |
| **What**           | `new QueryClient()` is instantiated with zero configuration. TanStack Query defaults to 3 retries with exponential backoff, but there is no `onError` callback, no `staleTime`, no `gcTime` (garbage collection), and no global error handler. Furthermore, **no hook in the codebase uses `useQuery` or `useMutation`** -- every data fetch uses raw `useEffect` + `useState` + `supabase.from()`. |
| **Why it matters** | TanStack Query is imported and provided but entirely unused. This means: (1) zero automatic retry on failed fetches, (2) zero cache deduplication (multiple components re-fetch the same data), (3) no `isError`/`isLoading` states from the query library, (4) wasted bundle size. All hooks manually reinvent loading/error state management.                                                     |

**Remediation (incremental):**

```tsx
// src/App.tsx -- at minimum, configure defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000, // 30 seconds
      refetchOnWindowFocus: false,
    },
  },
});
```

Longer-term: migrate hooks like `useParkingSpots`, `useStatistics`, `useWaitlist` etc. to `useQuery`/`useMutation` to get automatic retry, caching, and error boundaries for free.

---

### F7 -- No custom error types or centralized error handler

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Importance**     | 6/10                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Evidence**       | All hooks and pages (e.g., `src/hooks/useWaitlist.ts:78-81`, `src/pages/Index.tsx:64-66`)                                                                                                                                                                                                                                                                                                                                         |
| **What**           | Every error is caught as a generic `Error` or `unknown`. There are no custom error classes (e.g., `NetworkError`, `AuthError`, `ValidationError`). There is no centralized error handler -- each catch block independently decides whether to `console.error`, `console.warn`, `toast.error`, or some combination.                                                                                                                |
| **Why it matters** | (1) Auth errors (session expired) are not distinguished from network errors or validation failures. A 401 from Supabase is shown as a generic "Failed to load bookings" instead of prompting re-login. (2) Inconsistent logging: some errors use `console.warn` (useParkingSpots), some use `console.error` (Index.tsx), some do both. (3) No error categorization makes it impossible to implement targeted recovery strategies. |

**Remediation:**

```tsx
// src/lib/errors.ts
export function handleSupabaseError(error: { message: string; code?: string }, context: string) {
  console.error(`[${context}]`, error);

  if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
    toast.error('Your session has expired. Please log in again.');
    window.location.href = '/park-it-easy-office/auth';
    return;
  }
  if (error.code === '23505') {
    toast.error('This record already exists.');
    return;
  }
  toast.error(`Failed to ${context}. Please try again.`);
}
```

---

### F8 -- Dead service layer with superior error handling

|                    |                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                 |
| **Importance**     | 5/10                                                                                                                                                                                                                                                                                                                                       |
| **Evidence**       | `src/services/authService.ts`, `src/services/bookingService.ts`                                                                                                                                                                                                                                                                            |
| **What**           | The `AuthService` and `BookingService` classes implement proper Zod validation, structured `{success, error}` return types, specific error code handling (23505 unique constraint), and input sanitization. **None of this code is imported or called anywhere.** Instead, pages call Supabase directly with ad-hoc inline error handling. |
| **Why it matters** | The codebase has two parallel error-handling strategies: a well-designed but dead service layer, and the actually-used inline approach that lacks its features. This is confusing for maintainers and represents wasted effort. Either adopt the service layer or delete it.                                                               |

**Remediation:** Either wire up the existing services:

```tsx
// src/pages/Auth.tsx -- use AuthService instead of direct supabase calls
import { AuthService } from '@/services/authService';

const result = await AuthService.signIn({ email: loginEmail.trim(), password: loginPassword });
if (!result.success) {
  toast.error(result.error);
} else {
  toast.success('Welcome back!');
  navigate('/');
}
```

Or delete `src/services/authService.ts` and `src/services/bookingService.ts` to reduce confusion.

---

### F9 -- Supabase errors exposed raw to users

|                    |                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                 |
| **Importance**     | 6/10                                                                                                                                                                                                                                                       |
| **Evidence**       | `src/pages/Auth.tsx:101`, `src/pages/Index.tsx:96-97`                                                                                                                                                                                                      |
| **What**           | Several catch blocks pass `error.message` directly to `toast.error()`. Supabase error messages are developer-facing (e.g., "Invalid login credentials", "duplicate key value violates unique constraint \"bookings_pkey\"") and may leak internal details. |
| **Why it matters** | (1) Exposes database constraint names and internal error messages to end users. (2) Messages are not localized or user-friendly. (3) Some Supabase errors contain technical jargon that confuses non-technical users.                                      |

**Remediation:**

```tsx
// Map Supabase error codes to user-friendly messages
const USER_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Invalid email or password',
  '23505': 'This booking already exists',
  '42501': 'You do not have permission for this action',
};

function toUserMessage(error: { message: string; code?: string }): string {
  return USER_MESSAGES[error.code ?? ''] ?? 'Something went wrong. Please try again.';
}
```

---

### F10 -- Statistics.tsx fetches data in useEffect without user guard

|                    |                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                 |
| **Importance**     | 4/10                                                                                                                                                                                                                                                                                                    |
| **Evidence**       | `src/pages/Statistics.tsx:55-57`                                                                                                                                                                                                                                                                        |
| **What**           | `fetchBookings()` is called in `useEffect` without checking `user` first. The component is inside `<ProtectedRoute>`, so `user` should exist, but there is a timing window during mount where `user` may still be `null` from `useAuth`. Meanwhile `Index.tsx:33-38` correctly guards with `if (user)`. |
| **Why it matters** | If Supabase RLS policies require auth, the fetch could fail with a 401 during the `user === null` window, triggering a confusing "Failed to load statistics" toast before the data loads successfully on retry.                                                                                         |

**Remediation:**

```tsx
// src/pages/Statistics.tsx:55-57
useEffect(() => {
  if (user) fetchBookings();
}, [user]);
```

---

### F11 -- No error tracking / telemetry integration

|                    |                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                           |
| **Importance**     | 7/10                                                                                                                                                                                                                 |
| **Evidence**       | `src/components/ErrorBoundary.tsx:44-45` (TODO comment)                                                                                                                                                              |
| **What**           | The ErrorBoundary contains a TODO comment for Sentry integration. All errors go only to `console.error` or `console.warn`. There is no error tracking service, no telemetry, no way to know about production errors. |
| **Why it matters** | In production (GitHub Pages), errors are invisible to developers. A broken feature or recurring network issue would go unnoticed indefinitely.                                                                       |

**Remediation:** Integrate a lightweight error tracking service:

```tsx
// e.g., Sentry (free tier available)
// src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
});
```

---

### F12 -- Inconsistent error logging levels

|                |                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- |
| **Severity**   | **Low**                                                                                      |
| **Importance** | 3/10                                                                                         |
| **Evidence**   | Multiple files                                                                               |
| **What**       | Error logging uses a mix of `console.error` and `console.warn` with no consistent rationale: |

| File                      | Line  | Level   | Error Type              |
| ------------------------- | ----- | ------- | ----------------------- |
| `useParkingSpots.ts`      | 39    | `warn`  | Supabase query failure  |
| `useParkingSpots.ts`      | 55    | `error` | Catch block exception   |
| `useStatistics.ts`        | 57-63 | `warn`  | Supabase query failures |
| `useStatistics.ts`        | 73    | `error` | Catch block exception   |
| `useWaitlist.ts`          | 36    | `warn`  | Supabase query failure  |
| `useRecurringBookings.ts` | 29    | `warn`  | Supabase query failure  |
| `useBookingAudit.ts`      | 28    | `warn`  | Supabase query failure  |
| `Index.tsx`               | 65    | `error` | Supabase query failure  |
| `Statistics.tsx`          | 69    | `error` | Supabase query failure  |

| **Why it matters** | Inconsistent log levels make it difficult to filter errors in monitoring tools. `console.warn` for Supabase failures downplays what could be connectivity issues. |

**Remediation:** Standardize: use `console.error` for all failures, `console.warn` only for expected/recoverable conditions (e.g., profile-not-yet-created at `useUserProfile.ts:27`).

---

### F13 -- No retry mechanism on any data fetch

|                    |                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                  |
| **Importance**     | 6/10                                                                                                                                                                                                                                                                        |
| **Evidence**       | All hooks (`useParkingSpots.ts`, `useStatistics.ts`, `useWaitlist.ts`, etc.)                                                                                                                                                                                                |
| **What**           | Every data-fetching hook fires a single `supabase.from().select()` call. If it fails (network blip, rate limit, transient Supabase error), the error is logged and the user sees a toast. There is no automatic retry, no exponential backoff, no "retry" button in the UI. |
| **Why it matters** | On mobile or flaky networks, a single transient failure permanently leaves the page in an error state until the user manually refreshes. Hooks expose a `refetch` function but no component calls it on error.                                                              |

**Remediation (minimal):**

```tsx
// Add retry wrapper utility
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delay = 1000): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay * Math.pow(2, attempt)));
    }
  }
  throw new Error('Unreachable');
}
```

Better long-term: adopt `useQuery` from TanStack Query, which provides retry out of the box.

---

### F14 -- ErrorBoundary reset navigates with hard-coded base path

|                    |                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                |
| **Importance**     | 3/10                                                                                                                                                                                                                                                                                   |
| **Evidence**       | `src/components/ErrorBoundary.tsx:50`                                                                                                                                                                                                                                                  |
| **What**           | `window.location.href = '/park-it-easy-office/'` is hard-coded. If the base path changes, this breaks. Also, `window.location.href` causes a full page reload rather than a React Router navigation, which is intentional for error recovery but bypasses any app-level state cleanup. |
| **Why it matters** | Minor maintenance concern. The hard-coded path couples the error boundary to the deployment configuration.                                                                                                                                                                             |

**Remediation:**

```tsx
handleReset = () => {
  this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  window.location.href = import.meta.env.BASE_URL || '/';
};
```

---

### F15 -- Mock Supabase client is incomplete

|                    |                                                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                             |
| **Importance**     | 4/10                                                                                                                                                                                                                                                                                                |
| **Evidence**       | `src/integrations/supabase/client.ts:20-28`                                                                                                                                                                                                                                                         |
| **What**           | When `isSupabaseConfigured` is `false`, a mock client is created with only `auth` methods. It lacks `from()`, `rpc()`, `storage`, etc. Any code path that calls `supabase.from('bookings')` when Supabase is unconfigured will crash with "supabase.from is not a function".                        |
| **Why it matters** | The `isSupabaseConfigured` guard is used in hooks but not in all code paths (e.g., `BookingDialogWithValidation.tsx:71` calls `supabase.from('bookings')` without checking the flag). This crash would be caught by the ErrorBoundary, but the user gets no helpful message about misconfiguration. |

**Remediation:** Either add a `from()` stub:

```ts
from: () => ({
  select: async () => ({ data: [], error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' } }),
  insert: async () => ({ data: null, error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' } }),
  update: async () => ({ data: null, error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' } }),
  delete: async () => ({ data: null, error: { message: 'Supabase not configured', code: 'NOT_CONFIGURED' } }),
}),
```

Or add `isSupabaseConfigured` guards to all data-fetching components.

---

## Error Handling Gap Summary

| Category             | Status           | Details                                                                                                                                                                      |
| -------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Centralized handler  | **No**           | Each hook/page handles errors independently with ad-hoc try/catch + toast. Dead service layer (`authService.ts`, `bookingService.ts`) has structured handling but is unused. |
| Custom error types   | **No**           | All errors caught as `Error` or `unknown`. No `AuthError`, `NetworkError`, `ValidationError` classes. Supabase error codes only checked in one place (waitlist `23505`).     |
| Async error handling | **Inconsistent** | Most async functions have try/catch, but `signOut()` and `Auth.tsx:checkSession()` do not. No global `unhandledrejection` listener.                                          |
| User-facing messages | **Mixed**        | Some errors show raw Supabase messages (`error.message`), others show hardcoded user-friendly strings. No consistent mapping.                                                |
| Error recovery       | **No**           | No retry logic anywhere. No "retry" buttons. TanStack Query is installed but unused. ErrorBoundary offers "Return to Home" / "Reload Page" but no granular recovery.         |
| Error boundary       | **Partial**      | Single root-level ErrorBoundary exists and works for sync render errors. Dev-mode detail panel is broken (F1). Does not catch async errors. No per-route boundaries.         |
| Error tracking       | **No**           | TODO comment in ErrorBoundary for Sentry. All errors go only to browser console.                                                                                             |
| Toast consistency    | **Partial**      | All active code uses sonner, but a dead shadcn toast system is also mounted (F2).                                                                                            |

---

## Top 5 Prioritized Fixes

1. **Fix ErrorBoundary `process.env.NODE_ENV` bug** (F1) -- One-line fix, restores developer debugging capability immediately. Replace with `import.meta.env.DEV`.

2. **Add global `unhandledrejection` handler** (F3) + **Fix `signOut()` missing try/catch** (F4) -- Two small changes that close the biggest gap in async error coverage. Without these, any unhandled async error silently vanishes.

3. **Remove dead shadcn toast system** (F2) -- Delete `<Toaster />` from `App.tsx`, remove `src/hooks/use-toast.ts`, `src/components/ui/toaster.tsx`, `src/components/ui/use-toast.ts`. Eliminates confusion and dead code.

4. **Create centralized error handler + adopt the dead service layer** (F7, F8, F9) -- Either wire up `AuthService`/`BookingService` (which already have proper Zod validation and structured error returns), or extract their error handling into a shared utility. This addresses the root cause of inconsistent error handling across 7+ hooks.

5. **Migrate hooks to TanStack Query** (F6, F13) -- The library is already installed and provided. Migrating even 2-3 hooks (`useParkingSpots`, `useStatistics`) would add automatic retry, caching, deduplication, and proper `isError`/`isLoading` states with no custom code.
