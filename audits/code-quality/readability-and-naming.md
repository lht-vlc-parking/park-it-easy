# Readability & Naming Conventions Audit

**Date:** 2026-02-23
**Scope:** All `src/` files (~4,700 lines of custom code, 30 files)
**Risk Score: 5.5 / 10**

---

## Findings

### CRITICAL-01: `Statistics.tsx` is 1,465 Lines — God Component

|                    |                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Severity**       | Critical                                                                                                    |
| **Evidence**       | `src/pages/Statistics.tsx:1-1465`                                                                           |
| **What**           | ~500 lines of inline computation logic, 5+ inline helper functions, 30+ local variables, 960+ lines of JSX. |
| **Why it matters** | Unreadable, unreviewable, untestable. No developer can hold this file in their head.                        |

**Remediation:** Decompose into sub-components (`StreakCard`, `FairnessChart`, `TrendGraph`) and pure utility modules (`statisticsCalculations.ts`).

---

### CRITICAL-02: `Booking` Interface Duplicated 5 Times with Inconsistent Casing

|                    |                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | Critical                                                                                                                                                                    |
| **Evidence**       | `src/pages/Index.tsx:14`, `src/pages/Statistics.tsx:29`, `src/components/ParkingSpotCard.tsx:7`, `src/components/StatisticsCard.tsx:4`, `src/services/bookingService.ts:11` |
| **What**           | Five separate `Booking` type definitions. Statistics.tsx uses snake_case (matching DB), others use camelCase.                                                               |
| **Why it matters** | Inconsistent naming across the same domain type. Developers can't predict the shape.                                                                                        |

**Remediation:**

```ts
// src/types/booking.ts
export type Booking = Database['public']['Tables']['bookings']['Row'];
```

---

### CRITICAL-03: Hardcoded Production URL

|                    |                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| **Severity**       | Critical                                                                                              |
| **Evidence**       | `src/hooks/useAuth.tsx:39`                                                                            |
| **What**           | `window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth'`                   |
| **Why it matters** | Breaks local development. A `getAuthRedirectUrl()` helper exists in `authService.ts` but is not used. |

**Remediation:**

```ts
window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
```

---

### HIGH-01: 17+ Unused Variables Prefixed with `_`

|                    |                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Severity**       | High                                                                                                           |
| **Evidence**       | `src/pages/Statistics.tsx` (multiple), `src/pages/Index.tsx`                                                   |
| **What**           | Dead computed values: `_dailyOccupancy`, `_statsLoading`, `_activeBookings`, `_sharedTrips`, `_co2Saved`, etc. |
| **Why it matters** | Noise in already-massive files. Abandoned feature work polluting readability.                                  |

**Remediation:** Remove unused variables. Enable `noUnusedLocals: true` in `tsconfig.app.json`.

---

### HIGH-02: Magic Numbers Scattered Across Files

|              |                                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                                                                                                              |
| **Evidence** | `src/pages/Index.tsx` (`2` for max spots, `4` for max motorcycles), `src/pages/Statistics.tsx` (`1000*60*60*24` for ms/day), `src/components/BookingDialogWithValidation.tsx`     |
| **What**     | Numeric literals used inline without named constants. `bookingService.ts` has good constants (`MAX_CAR_BOOKINGS`, `MAX_MOTORCYCLE_BOOKINGS`) but they're not used by other files. |

**Remediation:**

```ts
// src/constants/booking.ts
export const MAX_CAR_BOOKINGS_PER_SPOT = 1;
export const MAX_MOTORCYCLE_BOOKINGS_PER_SPOT = 4;
export const MS_PER_DAY = 86_400_000;
```

---

### HIGH-03: Hook File Naming Inconsistency

|              |                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                                            |
| **Evidence** | `src/hooks/use-toast.ts`, `src/hooks/use-mobile.tsx` vs `src/hooks/useAuth.tsx`, `src/hooks/useParkingSpots.ts` |
| **What**     | kebab-case (`use-toast.ts`) vs camelCase (`useAuth.tsx`). Also `.ts` vs `.tsx` for hooks without JSX.           |

**Remediation:** Standardize to `useCamelCase.ts` for all custom hooks. The shadcn-generated ones (`use-toast`, `use-mobile`) can be kept as-is or renamed.

---

### HIGH-04: `overlaps()` Function Duplicated 3 Times

|              |                                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                            |
| **Evidence** | `src/components/BookingDialogWithValidation.tsx`, `src/services/bookingService.ts`, `src/test/` |
| **What**     | Three implementations of the same duration overlap check.                                       |

**Remediation:** Extract to a shared utility:

```ts
// src/utils/duration.ts
export function durationsOverlap(a: Duration, b: Duration): boolean {
  /* ... */
}
```

---

### HIGH-05: No JSDoc on Custom Hooks

|              |                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                                                                          |
| **Evidence** | `src/hooks/useAuth.tsx`, `src/hooks/useParkingSpots.ts`, `src/hooks/useStatistics.ts`, etc. (all 8 custom hooks)                              |
| **What**     | Zero documentation on any hook's purpose, parameters, or return values. Services (`authService.ts`, `bookingService.ts`) have thorough JSDoc. |

**Remediation:** Add JSDoc to each hook:

```ts
/**
 * Manages authentication state by subscribing to Supabase auth changes.
 * @returns {{ user: User | null, signOut: () => Promise<void>, loading: boolean }}
 */
export function useAuth() {
  /* ... */
}
```

---

### MEDIUM-01: Date Mutation Bug in `StatisticsCard.tsx`

|              |                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| **Severity** | Medium                                                                                                 |
| **Evidence** | `src/components/StatisticsCard.tsx:18-20`                                                              |
| **What**     | `today.setDate()` mutates the Date object, causing `thisWeekEnd` to be calculated from the wrong base. |

**Remediation:**

```ts
const thisWeekStart = new Date(today);
thisWeekStart.setDate(today.getDate() - today.getDay());
const thisWeekEnd = new Date(today);
thisWeekEnd.setDate(today.getDate() + (6 - today.getDay()));
```

---

### MEDIUM-02: Duplicate `isSupabaseConfigured`

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **Severity** | Medium                                                       |
| **Evidence** | `src/integrations/supabase/client.ts:8`, `src/lib/env.ts:75` |
| **What**     | Same check defined independently in two modules.             |

**Remediation:** Keep in `client.ts`, re-export or delete from `env.ts`.

---

### MEDIUM-03: Inconsistent Error Message Style

|              |                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| **Severity** | Medium                                                                                                 |
| **Evidence** | `src/pages/Auth.tsx:101,138,169` vs `src/services/authService.ts`                                      |
| **What**     | Auth.tsx shows raw Supabase errors; AuthService returns generic messages. Two inconsistent approaches. |

---

### LOW-01 — LOW-06: Minor Issues

| #      | Issue                                                          | Evidence                            |
| ------ | -------------------------------------------------------------- | ----------------------------------- |
| LOW-01 | `Auth.tsx` uses tabs, all other files use spaces               | `src/pages/Auth.tsx`                |
| LOW-02 | Some hooks use `async/await`, others use `.then()` chains      | Various hooks                       |
| LOW-03 | Import order varies: some group by type, others alphabetical   | Multiple files                      |
| LOW-04 | `StatisticsCard.tsx` exports default, others use named exports | `src/components/StatisticsCard.tsx` |
| LOW-05 | `ErrorBoundary.tsx` is the only class component                | `src/components/ErrorBoundary.tsx`  |
| LOW-06 | `v2/` subfolder contains only `ThemeToggle.tsx`                | `src/components/v2/`                |

---

## Pass/Fail Checklist

| Check                                | Status      | Notes                                                        |
| ------------------------------------ | ----------- | ------------------------------------------------------------ |
| Variable/function naming (camelCase) | **PASS**    | Consistent across custom code                                |
| Component naming (PascalCase)        | **PASS**    | All components follow convention                             |
| Constants (UPPER_SNAKE)              | **FAIL**    | Magic numbers used inline instead of named constants         |
| Naming clarity                       | **PARTIAL** | Services well-named; Statistics.tsx variables cryptic        |
| Function length (<50 lines)          | **FAIL**    | Statistics.tsx has functions >200 lines                      |
| Function signatures                  | **PASS**    | Generally clean, good destructuring                          |
| Code comments / JSDoc                | **PARTIAL** | Services documented, hooks undocumented                      |
| File naming consistency              | **FAIL**    | kebab-case vs camelCase hooks, `.ts` vs `.tsx` inconsistency |
| Import organization                  | **PASS**    | Generally grouped logically                                  |
| No magic numbers                     | **FAIL**    | Multiple magic numbers without named constants               |

---

## Top 5 Prioritized Fixes

| Priority | Fix                                                                | Effort | Impact                                        |
| -------- | ------------------------------------------------------------------ | ------ | --------------------------------------------- |
| **1**    | Decompose `Statistics.tsx` into sub-components and utility modules | Large  | Transforms readability of the largest file    |
| **2**    | Create canonical `Booking` type with consistent casing             | Small  | Eliminates confusion and type drift           |
| **3**    | Extract named constants for all magic numbers                      | Small  | Immediate readability and maintainability win |
| **4**    | Add JSDoc to all 8 custom hooks                                    | Small  | Developer onboarding and self-documentation   |
| **5**    | Fix hardcoded URL and date mutation bug                            | Small  | Correctness fixes                             |
