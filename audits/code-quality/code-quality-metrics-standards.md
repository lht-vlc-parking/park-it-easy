# Code Quality Metrics & Standards Audit

**Date:** 2026-02-23
**Scope:** All `src/` files — complexity, LOC, coupling, cohesion
**Risk Score: 5 / 10**

---

## File Metrics Summary

| File                                             | LOC         | Est. Cyclomatic Complexity | Imports | Issues                          |
| ------------------------------------------------ | ----------- | -------------------------- | ------- | ------------------------------- |
| `src/pages/Statistics.tsx`                       | 1,465       | Very High (30+)            | 12      | God component, 30+ local vars   |
| `src/pages/Index.tsx`                            | 513         | High (15+)                 | 10      | Inline CRUD, bypasses services  |
| `src/pages/Auth.tsx`                             | 422         | Medium (10+)               | 6       | Duplicates AuthService logic    |
| `src/services/bookingService.ts`                 | 364         | Medium (10)                | 4       | Dead code (never imported)      |
| `src/services/authService.ts`                    | 240         | Medium (8)                 | 3       | Dead code (never imported)      |
| `src/hooks/use-toast.ts`                         | 186         | Low (3)                    | 1       | Dead code (unused toast system) |
| `src/integrations/supabase/types.ts`             | 502         | N/A (generated)            | 0       | Auto-generated                  |
| `src/components/BookingDialogWithValidation.tsx` | ~200        | Medium (8)                 | 8       | Duplicate overlaps()            |
| `src/components/ParkingSpotCard.tsx`             | ~120        | Low (4)                    | 5       | Duplicate Booking type          |
| `src/components/StatisticsCard.tsx`              | 79          | Low (2)                    | 2       | Dead code (never imported)      |
| `src/components/ErrorBoundary.tsx`               | ~80         | Low (3)                    | 2       | `process.env.NODE_ENV` bug      |
| All hooks (8 files)                              | ~30-60 each | Low (2-4)                  | 2-3     | No JSDoc, some unused           |

---

## Findings

### F1 — `Statistics.tsx` Exceeds All Thresholds

|              |                                                                                                                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Critical                                                                                                                                                                                             |
| **Evidence** | `src/pages/Statistics.tsx:1-1465`                                                                                                                                                                    |
| **Metrics**  | 1,465 LOC (threshold: 300), ~30+ cyclomatic complexity (threshold: 10), 30+ local variables, 5+ inline functions >50 lines                                                                           |
| **What**     | Contains ~500 lines of inline business logic (date math, streak calculations, fairness scores, trend predictions), plus ~960 lines of JSX. Multiple deeply nested ternaries and conditional renders. |

**Remediation:** Extract into:

- `src/utils/statisticsCalculations.ts` — pure functions
- `src/hooks/useBookingStatistics.ts` — composition hook
- `src/components/statistics/*.tsx` — presentational components

---

### F2 — `Index.tsx` Exceeds LOC Threshold

|              |                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| **Severity** | High                                                                                                   |
| **Evidence** | `src/pages/Index.tsx:1-513`                                                                            |
| **Metrics**  | 513 LOC (threshold: 300), ~15 cyclomatic complexity                                                    |
| **What**     | Inline Supabase queries, booking CRUD, personal stats computation, and rendering all in one component. |

**Remediation:** Extract data operations into `useBookings` hook.

---

### F3 — `Auth.tsx` Exceeds LOC Threshold

|              |                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Medium                                                                                                                          |
| **Evidence** | `src/pages/Auth.tsx:1-422`                                                                                                      |
| **Metrics**  | 422 LOC (threshold: 300), ~10 cyclomatic complexity                                                                             |
| **What**     | Login, signup, and password reset forms with inline Supabase calls. Three separate form handlers with similar validation logic. |

**Remediation:** Use `AuthService` for business logic; extract form components.

---

### F4 — High Coupling: 13+ Files Import Supabase Directly

|              |                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                                                               |
| **Evidence** | `src/pages/Index.tsx`, `src/pages/Auth.tsx`, `src/pages/Statistics.tsx`, 8 hooks, `src/components/BookingDialogWithValidation.tsx` |
| **Metrics**  | Afferent coupling to `supabase/client.ts`: 13 files                                                                                |
| **What**     | Nearly every file imports and calls `supabase` directly. No repository/service abstraction is used (despite services existing).    |

**Remediation:** Route all data access through services or a repository layer.

---

### F5 — Dead Code: 790+ Lines Never Executed

|              |                                                                                                                                                                       |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                                                                                                  |
| **Evidence** | `src/services/authService.ts` (240 LOC), `src/services/bookingService.ts` (364 LOC), `src/hooks/use-toast.ts` (186 LOC), `src/components/StatisticsCard.tsx` (79 LOC) |
| **Metrics**  | 869 lines of dead code out of ~4,700 custom lines (18.5%)                                                                                                             |
| **What**     | Well-written services and a toast system that are never imported.                                                                                                     |

**Remediation:** Either wire up or delete. 18.5% dead code is significant.

---

### F6 — Low Cohesion: `Statistics.tsx` Handles 6+ Concerns

|              |                                                                                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | High                                                                                                                                                           |
| **Evidence** | `src/pages/Statistics.tsx`                                                                                                                                     |
| **What**     | Data fetching, date math, streak calculations, fairness scoring, trend prediction, CO2 calculations, chart data transformation, and rendering ~20 UI sections. |
| **Metrics**  | LCOM (Lack of Cohesion) would be extremely high — variables used in one section are irrelevant to others.                                                      |

**Remediation:** Split by concern into focused modules.

---

### F7 — Duplicate Logic: `overlaps()` in 3 Places

|              |                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------- |
| **Severity** | Medium                                                                                    |
| **Evidence** | `src/components/BookingDialogWithValidation.tsx`, `src/services/bookingService.ts`, tests |
| **Metrics**  | 3 implementations of same algorithm                                                       |

**Remediation:** Extract to `src/utils/duration.ts`.

---

### F8 — ~450 Lines of Expensive Computation Without `useMemo`

|              |                                                                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------- |
| **Severity** | Medium                                                                                                            |
| **Evidence** | `src/pages/Statistics.tsx` (multiple inline computations)                                                         |
| **What**     | Derived state recalculates on every render. Includes sorting, filtering, date math, and statistical computations. |

**Remediation:**

```ts
const streak = useMemo(() => calculateStreak(bookings), [bookings]);
const fairness = useMemo(() => calculateFairnessScore(bookings, users), [bookings, users]);
```

---

## Pass/Fail Checklist

| Metric                           | Threshold | Status   | Worst Offender                    |
| -------------------------------- | --------- | -------- | --------------------------------- |
| File LOC < 300                   | 300       | **FAIL** | Statistics.tsx (1,465)            |
| Function LOC < 50                | 50        | **FAIL** | Statistics.tsx inline functions   |
| Cyclomatic complexity < 10       | 10        | **FAIL** | Statistics.tsx (~30+)             |
| Coupling (imports per file) < 10 | 10        | **PASS** | Index.tsx (10, borderline)        |
| Afferent coupling < 10           | 10        | **FAIL** | supabase/client.ts (13 importers) |
| Dead code < 5%                   | 5%        | **FAIL** | 18.5% dead code                   |
| Duplicate code                   | 0         | **FAIL** | Booking type x5, overlaps() x3    |
| Memoized expensive computation   | Yes       | **FAIL** | ~450 lines unmemoized             |

---

## Top 5 Prioritized Fixes

| Priority | Fix                                                              | Effort | Impact                                             |
| -------- | ---------------------------------------------------------------- | ------ | -------------------------------------------------- |
| **1**    | Decompose `Statistics.tsx` (1,465 LOC → multiple files <200 LOC) | Large  | Fixes LOC, complexity, cohesion, memoization       |
| **2**    | Delete or wire up dead code (869 LOC, 18.5%)                     | Medium | Reduces maintenance burden, clarifies architecture |
| **3**    | Introduce repository/service abstraction for Supabase calls      | Medium | Reduces coupling from 13 to 1-2 files              |
| **4**    | Extract shared utilities (Booking type, overlaps(), constants)   | Small  | Eliminates duplication                             |
| **5**    | Add `useMemo` to expensive computations                          | Small  | Performance improvement                            |
