# Initial Software Design Analysis

**Date:** 2026-02-23
**Scope:** Full `src/`, config files, `e2e/`, `supabase/` schema
**Risk Score: 4 / 10**

---

## Architecture Overview

```
Browser
  └─ React SPA (Vite + React Router)
       ├─ Pages
       │    ├─ Auth.tsx          (login/signup — calls supabase directly)
       │    ├─ Index.tsx         (booking CRUD — calls supabase directly)
       │    ├─ Statistics.tsx    (analytics — mixed hook + direct supabase)
       │    └─ NotFound.tsx
       ├─ Components
       │    ├─ ParkingSpotCard, BookingDialogWithValidation
       │    ├─ ProtectedRoute, ErrorBoundary, ThemeToggle
       │    └─ StatisticsCard (dead code)
       ├─ Hooks
       │    ├─ useAuth (no Context — standalone per-consumer)
       │    ├─ useStatistics, useParkingSpots, useWaitlist (partially used)
       │    └─ useRecurringBookings, useBookingAudit, useUserProfile (unused)
       ├─ Services (DEAD CODE)
       │    ├─ authService.ts
       │    └─ bookingService.ts
       └─ Integrations
            └─ supabase/client.ts + types.ts

Supabase (BaaS)
  ├─ Auth (email/password)
  ├─ PostgreSQL (bookings, parking_spots, profiles, waitlist, audit)
  └─ RLS policies
```

**Key observation:** A service layer and custom hooks exist but pages bypass them, calling Supabase directly. The intended architecture is never realized.

---

## Findings

### F1 — God Component: `Statistics.tsx` (1,465 lines)

|                    |                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                                                                                                                                |
| **Evidence**       | `src/pages/Statistics.tsx:1-1465`                                                                                                                                           |
| **What**           | ~1,000 lines of inline business logic: date math, streak calculations, fairness scores, trend predictions, statistical computations — all inside a single render component. |
| **Why it matters** | Untestable (no unit tests possible without rendering), unmaintainable, impossible to review in PRs. Any change risks regressions across unrelated stats.                    |

**Remediation:** Extract computation into pure utility functions and dedicated hooks:

```ts
// src/utils/statisticsCalculations.ts
export function calculateStreak(bookings: Booking[]): number {
  /* ... */
}
export function calculateFairnessScore(bookings: Booking[], users: string[]): number {
  /* ... */
}
export function predictTrend(data: number[]): number[] {
  /* ... */
}
```

```ts
// src/hooks/useBookingStatistics.ts
export function useBookingStatistics(userId: string) {
  const { data: bookings } = useStatistics(userId);
  return useMemo(
    () => ({
      streak: calculateStreak(bookings),
      fairness: calculateFairnessScore(bookings, users),
    }),
    [bookings]
  );
}
```

---

### F2 — God Component: `Index.tsx` (513 lines)

|                    |                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                              |
| **Evidence**       | `src/pages/Index.tsx:1-513`                                                                                                                           |
| **What**           | Page contains inline Supabase queries, booking CRUD, personal statistics computation, and all rendering. Ignores existing `BookingService` and hooks. |
| **Why it matters** | Duplicates logic that `bookingService.ts` already implements. Two sources of truth for booking operations.                                            |

**Remediation:** Use existing `BookingService` or extract a `useBookings` hook:

```ts
// Replace inline queries in Index.tsx with:
const { bookings, createBooking, deleteBooking } = useBookings(user.id);
```

---

### F3 — Duplicated `Booking` Interface (6 definitions)

|                    |                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                    |
| **Evidence**       | `src/pages/Index.tsx:14`, `src/pages/Statistics.tsx:29`, `src/components/ParkingSpotCard.tsx:7`, `src/components/StatisticsCard.tsx:4`, `src/services/bookingService.ts:11` |
| **What**           | Each file defines its own `Booking` type with subtly different shapes (`vehicle_type` vs `vehicleType`, optional vs required `created_at`).                                 |
| **Why it matters** | Type divergence causes silent runtime bugs when one component passes data to another expecting a different shape.                                                           |

**Remediation:** Single source of truth:

```ts
// src/types/booking.ts
export type Booking = Database['public']['Tables']['bookings']['Row'];
```

Then import everywhere. Delete all local definitions.

---

### F4 — Dead Service Layer

|                    |                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                     |
| **Evidence**       | `src/services/authService.ts:1-240`, `src/services/bookingService.ts:1-364`                                                                  |
| **What**           | Well-structured services with validation exist but are never imported by any page or component. Pages call `supabase` directly.              |
| **Why it matters** | 604 lines of maintained-but-unused code. Creates confusion about where logic should live. New developers won't know which pattern to follow. |

**Remediation:** Either wire pages to use these services, or delete them. Don't maintain two paths.

---

### F5 — No Auth Context (per-consumer subscriptions)

|                    |                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                    |
| **Evidence**       | `src/hooks/useAuth.tsx:1-43`                                                                                                                                                |
| **What**           | `useAuth` is a plain hook, not backed by a Context provider. Every component calling `useAuth()` creates its own `onAuthStateChange` subscription and independent state.    |
| **Why it matters** | Race conditions between components reading different auth states. Unnecessary Supabase listener overhead. Sign-out in one component doesn't immediately reflect in another. |

**Remediation:**

```tsx
// src/contexts/AuthContext.tsx
const AuthContext = createContext<AuthState>(null!);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);
  return <AuthContext.Provider value={{ user }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
```

---

### F6 — Hardcoded Parking Spots (84, 85)

|                    |                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                |
| **Evidence**       | `src/pages/Index.tsx`, `src/components/ParkingSpotCard.tsx`, `src/pages/Statistics.tsx`                   |
| **What**           | Spot numbers 84 and 85 are hardcoded despite a `parking_spots` table and `useParkingSpots` hook existing. |
| **Why it matters** | Adding or renaming a spot requires code changes across multiple files instead of a DB update.             |

**Remediation:** Use `useParkingSpots()` to drive the spot list dynamically.

---

### F7 — Duplicate `isSupabaseConfigured`

|                    |                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                   |
| **Evidence**       | `src/integrations/supabase/client.ts:8`, `src/lib/env.ts:75`                                                                 |
| **What**           | Same boolean check exported from two modules.                                                                                |
| **Why it matters** | Consumers may import from either, and if the check logic diverges, one path may silently allow unconfigured Supabase access. |

**Remediation:** Keep it in `client.ts` (closest to the supabase instance). Re-export from `env.ts` if needed, or delete the duplicate.

---

### F8 — Duplicate Toast Systems

|                    |                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                               |
| **Evidence**       | `src/App.tsx:27-28` (both `<Toaster />` and `<Sonner />`), `src/hooks/use-toast.ts:1-186`                                                                                |
| **What**           | Two independent toast systems are mounted: `sonner` and shadcn/ui's reducer-based `use-toast`. App uses `sonner` everywhere, making the shadcn toast system dead weight. |
| **Why it matters** | 186 lines of unused toast reducer code. Two toast containers could show overlapping notifications. Bundle size waste.                                                    |

**Remediation:** Remove `<Toaster />` from `App.tsx`, delete `src/hooks/use-toast.ts` and its re-export at `src/components/ui/use-toast.ts`. Keep only `sonner`.

---

### F9 — Hardcoded Redirect URL

|                    |                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                        |
| **Evidence**       | `src/hooks/useAuth.tsx:39`                                                                                        |
| **What**           | `window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth'` — hardcoded GitHub Pages URL. |
| **Why it matters** | Breaks in any non-production environment (localhost, staging, custom domain).                                     |

**Remediation:**

```ts
navigate('/auth'); // use react-router
// or at minimum:
window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
```

---

### F10 — `process.env.NODE_ENV` in Vite Project

|                    |                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                         |
| **Evidence**       | `src/components/ErrorBoundary.tsx:73`                                                              |
| **What**           | Uses `process.env.NODE_ENV` which is not defined in Vite's client bundle.                          |
| **Why it matters** | Condition always evaluates to `undefined`, so the development error details branch never triggers. |

**Remediation:**

```ts
{import.meta.env.DEV && (
  <details>...</details>
)}
```

---

### F11 — Booking Duplicate Check by `user_name`

|                    |                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                          |
| **Evidence**       | `src/components/BookingDialogWithValidation.tsx:74`                                                                                                 |
| **What**           | Duplicate booking validation queries by `user_name` string instead of `user_id`.                                                                    |
| **Why it matters** | If a user changes their display name, old bookings won't match the check, allowing duplicates. Two users with the same name could block each other. |

**Remediation:** Query by `user_id` (the stable foreign key to auth.users).

---

### F12 — Abandoned/Dead Variables in `Statistics.tsx`

|                    |                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                      |
| **Evidence**       | `src/pages/Statistics.tsx` — multiple `_`-prefixed variables                                 |
| **What**           | Underscore-prefixed destructured variables are never used. Indicates abandoned feature work. |
| **Why it matters** | Noise in a 1,465-line file. Makes code archaeology harder.                                   |

**Remediation:** Remove unused destructured variables. Enable `noUnusedLocals: true` in `tsconfig.app.json`.

---

### F13 — Dead Component: `StatisticsCard.tsx`

|              |                                          |
| ------------ | ---------------------------------------- |
| **Severity** | **Low**                                  |
| **Evidence** | `src/components/StatisticsCard.tsx:1-79` |
| **What**     | Not imported anywhere in the codebase.   |

**Remediation:** Delete the file.

---

### F14 — E2E Tests Mostly Skipped

|              |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Severity** | **Low**                                                                                       |
| **Evidence** | `e2e/booking.spec.ts`, `e2e/statistics.spec.ts` — nearly all tests use `test.skip`            |
| **What**     | Tests exist structurally but are disabled. Only `app.spec.ts` basic smoke test actually runs. |

**Remediation:** Either fix and enable the tests or remove the skipped shells to avoid confusion.

---

### F15 — Strict Mode Undermined

|              |                                                                            |
| ------------ | -------------------------------------------------------------------------- |
| **Severity** | **Low**                                                                    |
| **Evidence** | `tsconfig.app.json` — `noUnusedLocals: false`, `noUnusedParameters: false` |

**Remediation:** Set both to `true` and fix the resulting errors.

---

## Risk Score

| Category        | Score (0-10) | Notes                                                         |
| --------------- | ------------ | ------------------------------------------------------------- |
| Maintainability | 3/10         | Two god components, duplicated types, dead service layer      |
| Reliability     | 5/10         | Auth race conditions, name-based duplicate checks             |
| Testability     | 2/10         | Business logic trapped in render components, E2E skipped      |
| Architecture    | 3/10         | Intended layering (services, hooks) exists but is unused      |
| Security        | 7/10         | RLS present, no secrets in code, but hardcoded URL is a smell |
| **Overall**     | **4/10**     |                                                               |

---

## Top 5 Prioritized Fixes

| Priority | Fix                                                                                                                          | Effort        | Impact                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------- |
| **1**    | Create `AuthContext` provider to replace standalone `useAuth` hook                                                           | Small (1-2h)  | Eliminates auth race conditions across entire app    |
| **2**    | Extract a canonical `Booking` type from `Database['public']['Tables']['bookings']['Row']` and delete all 6 local definitions | Small (1h)    | Eliminates type drift bugs, single source of truth   |
| **3**    | Break `Statistics.tsx` into pure calculation utils + composition hooks + presentational components                           | Large (1-2d)  | Unlocks unit testing, makes stats maintainable       |
| **4**    | Wire `Index.tsx` to use `BookingService` or a `useBookings` hook; delete dead service code if not adopting it                | Medium (3-4h) | Removes logic duplication, clarifies architecture    |
| **5**    | Fix `ErrorBoundary` to use `import.meta.env.DEV`, fix hardcoded redirect URL, remove duplicate toast system                  | Small (30m)   | Quick wins that eliminate runtime bugs and dead code |

---

## Pass/Fail Checklist

| Check                                        | Status   | Notes                                                         |
| -------------------------------------------- | -------- | ------------------------------------------------------------- |
| Single source of truth for domain types      | **FAIL** | 6 duplicate `Booking` definitions                             |
| Service/data layer separation                | **FAIL** | Pages bypass services, call Supabase directly                 |
| No god components (>300 LOC)                 | **FAIL** | `Statistics.tsx` (1,465), `Index.tsx` (513), `Auth.tsx` (422) |
| Auth state shared via Context                | **FAIL** | Standalone hook, no provider                                  |
| No dead code                                 | **FAIL** | 2 unused services, 1 unused component, unused variables       |
| Environment-aware config (no hardcoded URLs) | **FAIL** | Hardcoded GH Pages URL in `useAuth.tsx:39`                    |
| Vite-compatible env access                   | **FAIL** | `process.env.NODE_ENV` in `ErrorBoundary.tsx:73`              |
| No duplicate utilities                       | **FAIL** | `isSupabaseConfigured` x2, toast system x2                    |
| Data-driven (no magic numbers)               | **FAIL** | Hardcoded spots 84, 85                                        |
| Stable identity for DB queries               | **FAIL** | Duplicate check uses `user_name` not `user_id`                |
| E2E test coverage                            | **FAIL** | Nearly all tests skipped                                      |
| TypeScript strict unused checks              | **FAIL** | `noUnusedLocals`/`noUnusedParameters` disabled                |
| RLS / security policies                      | **PASS** | Supabase RLS is configured                                    |
| No secrets in source                         | **PASS** | Only public anon key committed (expected for Supabase)        |
| React error boundary                         | **PASS** | Present (though `import.meta.env` bug exists)                 |
| Routing / code splitting                     | **PASS** | Lazy routes with `React.lazy` in `App.tsx`                    |
