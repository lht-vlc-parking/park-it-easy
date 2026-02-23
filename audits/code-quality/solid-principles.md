# SOLID Principles Audit

**Date:** 2026-02-23
**Scope:** All `src/` files — hooks, services, pages, components, integrations
**SOLID Compliance Rating: 4 / 10**

---

## Per-Principle Ratings

| Principle             | Rating | Summary                                                          |
| --------------------- | ------ | ---------------------------------------------------------------- |
| Single Responsibility | 3/10   | God components, services duplicated by pages                     |
| Open/Closed           | 5/10   | Hardcoded spots/config limit extensibility                       |
| Liskov Substitution   | 7/10   | N/A for most (functional components); minor type shape issues    |
| Interface Segregation | 5/10   | Hooks return too much unused data; Supabase types are monolithic |
| Dependency Inversion  | 3/10   | Direct Supabase coupling everywhere; no abstraction layer        |

---

## Findings

### F1 — SRP Violation: `Statistics.tsx` Does Everything

|                    |                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                                                                                                                                                        |
| **Importance**     | 10/10                                                                                                                                                                                               |
| **Evidence**       | `src/pages/Statistics.tsx:1-1465`                                                                                                                                                                   |
| **What**           | Single component handles: data fetching, date calculations, streak logic, fairness scoring, trend prediction, CO2 calculations, chart data transformation, and rendering ~20 different UI sections. |
| **Why it matters** | Violates SRP fundamentally — has dozens of reasons to change. Impossible to test individual calculations in isolation.                                                                              |

**Remediation:** Extract into focused units:

```ts
// Pure calculation functions (testable independently)
// src/utils/streakCalculator.ts
// src/utils/fairnessScorer.ts
// src/utils/trendPredictor.ts

// Composition hooks
// src/hooks/useBookingStreak.ts
// src/hooks/useFairnessScore.ts

// Presentational components
// src/components/statistics/StreakCard.tsx
// src/components/statistics/FairnessChart.tsx
// src/components/statistics/TrendGraph.tsx
```

---

### F2 — SRP Violation: `Index.tsx` Mixes Data + Logic + UI

|                |                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **High**                                                                                                                                     |
| **Importance** | 8/10                                                                                                                                         |
| **Evidence**   | `src/pages/Index.tsx:1-513`                                                                                                                  |
| **What**       | Handles booking CRUD (direct Supabase calls), personal stats, validation, and all rendering. Ignores `BookingService` and `useParkingSpots`. |

**Remediation:**

```ts
// Extract data operations into a hook
// src/hooks/useBookings.ts
export function useBookings(userId: string) {
  // ... encapsulate all booking queries and mutations
  return { bookings, createBooking, deleteBooking, isLoading };
}
```

---

### F3 — SRP Violation: `Auth.tsx` Duplicates AuthService

|                |                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **High**                                                                                                                                                                                                             |
| **Importance** | 7/10                                                                                                                                                                                                                 |
| **Evidence**   | `src/pages/Auth.tsx:85-179` vs `src/services/authService.ts:61-216`                                                                                                                                                  |
| **What**       | Auth page calls `supabase.auth.*` directly with inline error handling, while `AuthService` provides the same operations with Zod validation and generic error messages. Two implementations, neither uses the other. |

**Remediation:** `Auth.tsx` should delegate to `AuthService`:

```tsx
const result = await AuthService.login(email, password);
if (!result.success) {
  toast.error(result.error);
}
```

---

### F4 — OCP Violation: Hardcoded Parking Spots

|                |                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | **Medium**                                                                                                                                                         |
| **Importance** | 6/10                                                                                                                                                               |
| **Evidence**   | `src/pages/Index.tsx` (spots 84/85 hardcoded), `src/components/ParkingSpotCard.tsx`                                                                                |
| **What**       | Adding a new parking spot requires code changes across multiple files. The `parking_spots` table and `useParkingSpots` hook exist but aren't used to drive the UI. |

**Remediation:**

```tsx
const { data: spots } = useParkingSpots();
return spots?.map(spot => <ParkingSpotCard key={spot.id} spot={spot} />);
```

---

### F5 — OCP Violation: Hardcoded Toast Systems

|                |                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Low**                                                                                                                                                                       |
| **Importance** | 4/10                                                                                                                                                                          |
| **Evidence**   | `src/App.tsx:27-28`, `src/hooks/use-toast.ts:1-186`                                                                                                                           |
| **What**       | Two toast systems mounted simultaneously. App uses `sonner` but still ships the shadcn `use-toast` reducer. Cannot swap notification systems without touching multiple files. |

**Remediation:** Remove the unused shadcn toast system entirely.

---

### F6 — DIP Violation: Direct Supabase Coupling in 13+ Files

|                    |                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                         |
| **Importance**     | 9/10                                                                                                                                                                                                                                                                                                                                             |
| **Evidence**       | `src/pages/Index.tsx`, `src/pages/Auth.tsx`, `src/pages/Statistics.tsx`, `src/hooks/useAuth.tsx`, `src/hooks/useParkingSpots.ts`, `src/hooks/useStatistics.ts`, `src/hooks/useWaitlist.ts`, `src/hooks/useRecurringBookings.ts`, `src/hooks/useBookingAudit.ts`, `src/hooks/useUserProfile.ts`, `src/components/BookingDialogWithValidation.tsx` |
| **What**           | Nearly every file imports `supabase` directly from `src/integrations/supabase/client.ts` and calls `.from('table').*` inline. No abstraction layer exists between components and the data source.                                                                                                                                                |
| **Why it matters** | Cannot swap Supabase for another provider, mock for testing, or add cross-cutting concerns (logging, caching, retry) without touching every file.                                                                                                                                                                                                |

**Remediation:** Create a repository pattern:

```ts
// src/repositories/bookingRepository.ts
export const bookingRepository = {
  async getByDate(date: string, spotNumber: number) {
    return supabase
      .from('bookings')
      .select('*')
      .eq('booking_date', date)
      .eq('spot_number', spotNumber);
  },
  async create(booking: BookingInsert) {
    return supabase.from('bookings').insert(booking);
  },
  // ...
};
```

---

### F7 — ISP Violation: Monolithic Hook Returns

|                |                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**   | **Medium**                                                                                                                                 |
| **Importance** | 5/10                                                                                                                                       |
| **Evidence**   | `src/hooks/useStatistics.ts`, `src/pages/Statistics.tsx` (destructuring with many `_` prefixed unused vars)                                |
| **What**       | Hooks return large objects where consumers use only a subset. `Statistics.tsx` destructures many values and prefixes unused ones with `_`. |

**Remediation:** Split hooks into focused units or use selector patterns:

```ts
// Instead of one useStatistics() returning everything:
const { streak } = useBookingStreak(userId);
const { fairness } = useFairnessScore(userId);
```

---

### F8 — DIP Violation: No Auth Abstraction (Context)

|                |                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **High**                                                                                                                               |
| **Importance** | 8/10                                                                                                                                   |
| **Evidence**   | `src/hooks/useAuth.tsx:1-43`                                                                                                           |
| **What**       | `useAuth` creates independent Supabase subscriptions per consumer. No Context provider means no single source of truth for auth state. |

**Remediation:** Wrap in a Context provider (see initial-software-design-analysis F5 for full code).

---

### F9 — LSP Concern: Inconsistent `Booking` Shapes

|                |                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**   | **Medium**                                                                                                                                                            |
| **Importance** | 6/10                                                                                                                                                                  |
| **Evidence**   | `src/pages/Index.tsx:14`, `src/pages/Statistics.tsx:29`, `src/components/ParkingSpotCard.tsx:7`, `src/services/bookingService.ts:11`                                  |
| **What**       | Six different `Booking` interfaces with subtly different field names and optionality. Components passing bookings to each other may violate expected shape contracts. |

**Remediation:** Single canonical type derived from Supabase types (see initial-software-design-analysis F3).

---

## Top 5 Prioritized Fixes

| Priority | Principle | Fix                                                            | Effort | Impact                              |
| -------- | --------- | -------------------------------------------------------------- | ------ | ----------------------------------- |
| **1**    | DIP       | Create `AuthContext` provider for single auth source of truth  | Small  | Eliminates race conditions          |
| **2**    | SRP       | Break `Statistics.tsx` into focused utils + hooks + components | Large  | Unlocks testing, maintainability    |
| **3**    | DIP       | Introduce repository pattern to abstract Supabase calls        | Medium | Enables testing, swappable backends |
| **4**    | SRP       | Wire `Auth.tsx` and `Index.tsx` to use existing services       | Medium | Eliminates duplication              |
| **5**    | LSP       | Unify `Booking` type from Supabase-generated types             | Small  | Prevents type drift bugs            |
