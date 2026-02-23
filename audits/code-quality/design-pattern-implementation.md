# Design Pattern Implementation Audit

**Date:** 2026-02-23
**Scope:** Full `src/` directory
**Risk Score: 7 / 10**

> High risk. The codebase has scaffolded several patterns (Singleton, Service Layer, Repository) but
> most are either incorrectly implemented or entirely dead code. The dominant architecture is
> "page-component calls Supabase directly," which defeats every abstraction layer the project
> attempted to introduce. Combined with the absence of shared auth state and zero memoization on
> ~450 lines of computation, the pattern debt is significant.

---

## Patterns Found

### P1 — Singleton (Partial): Supabase Client

|                |                                                                                                                                                                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 9/10                                                                                                                                                                                                                                                                                              |
| **Evidence**   | `src/integrations/supabase/client.ts:12-29`                                                                                                                                                                                                                                                       |
| **Assessment** | Correct                                                                                                                                                                                                                                                                                           |
| **What**       | A single `supabase` client instance is exported from `client.ts` and imported by all consumers. The module-level `const supabase` is evaluated once and cached by the ES module system, which is the idiomatic JavaScript Singleton. Includes a graceful fallback mock when env vars are missing. |

The implementation is clean and appropriate. The conditional mock client (`lines 20-28`) prevents
crashes when Supabase is unconfigured — a form of the Null Object pattern.

**No action needed.** This is the correct approach.

---

### P2 — Facade: `useStatistics` Hook

|                |                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Importance** | 6/10                                                                                                                                                                                                   |
| **Evidence**   | `src/hooks/useStatistics.ts:20-91`                                                                                                                                                                     |
| **Assessment** | Partial                                                                                                                                                                                                |
| **What**       | `useStatistics` fans out 5 parallel Supabase queries and aggregates results into a single `StatisticsData` object. This is a Facade — it simplifies access to multiple database views behind one hook. |

**Problem:** The Facade is bypassed. `Statistics.tsx:59-80` runs its _own_ raw
`supabase.from('bookings').select('*')` query, then performs ~450 lines of client-side
computation duplicating what the database views already provide. The hook's results (`_dailyOccupancy`,
`_weeklyTrends`) are fetched but prefixed with `_` and ignored:

```typescript
// Statistics.tsx:48-51
const {
  userStats,
  dailyOccupancy: _dailyOccupancy, // fetched but discarded
  fairness,
  weeklyTrends: _weeklyTrends, // fetched but discarded
  loading: _statsLoading, // even loading state is ignored
} = useStatistics();
```

This means the Facade exists but provides no value — wasting a network round-trip while the page
does everything itself.

---

### P3 — Guard/Proxy: `ProtectedRoute`

|                |                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Importance** | 7/10                                                                                                               |
| **Evidence**   | `src/components/ProtectedRoute.tsx:9-25`                                                                           |
| **Assessment** | Correct                                                                                                            |
| **What**       | Classic Proxy (Protection Proxy) pattern — wraps child routes, checks auth state, redirects unauthenticated users. |

Implementation is minimal and correct. Used at `App.tsx:35-36` and `App.tsx:43-44`.

**Problem:** Each `ProtectedRoute` instance creates an independent `useAuth()` subscription (see M1
below), so 2 protected routes = 2 subscriptions + the one in `Auth.tsx`. Not a pattern defect per
se, but a consequence of the missing Context pattern.

---

### P4 — Observer: Supabase Auth State Change Listener

|                |                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 7/10                                                                                                                                   |
| **Evidence**   | `src/hooks/useAuth.tsx:24-29`, `src/pages/Auth.tsx:39-50`                                                                              |
| **Assessment** | Incorrect (duplicated)                                                                                                                 |
| **What**       | `supabase.auth.onAuthStateChange()` is Supabase's Observer implementation — subscribers receive notifications when auth state changes. |

**Problem:** The Observer is subscribed to _independently_ in every consumer rather than once at a
shared root. Each `useAuth()` call creates a new subscription:

```
ProtectedRoute (Index)    → useAuth() → onAuthStateChange subscription #1
ProtectedRoute (Stats)    → useAuth() → onAuthStateChange subscription #2
Auth.tsx                  → direct onAuthStateChange subscription     #3
Index.tsx                 → useAuth() → onAuthStateChange subscription #4
Statistics.tsx             → useAuth() → onAuthStateChange subscription #5
BookingDialogWithValidation.tsx → useAuth() → onAuthStateChange sub. #6
```

At full app load with navigation, 3-4 subscriptions are active simultaneously. Each fires
`getSession()` on mount. This is a memory and network waste.

---

### P5 — Strategy (Informal): Booking Validation in `BookingDialogWithValidation`

|                |                                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 5/10                                                                                                                                                                                                                    |
| **Evidence**   | `src/components/BookingDialogWithValidation.tsx:100-151`                                                                                                                                                                |
| **Assessment** | Partial                                                                                                                                                                                                                 |
| **What**       | The validation logic uses a strategy-like approach: car bookings and motorcycle bookings follow different validation rules selected by `vehicleType`. The `overlaps()` helper at line 100 is shared between strategies. |

This isn't a formal Strategy pattern (no interface, no interchangeable objects), but it follows the
_intent_ — selecting different validation behavior based on vehicle type. For this scale, an
informal if/else approach is acceptable.

**Observation:** The exact same strategy exists in `bookingService.ts:56-161` (dead code) with
better structure (private methods, constants, Zod validation). The live code at
`BookingDialogWithValidation.tsx` reimplements it inline without any of those improvements.

---

### P6 — Reducer/Command: Toast State Management

|                |                                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 3/10                                                                                                                                                                                                                                                                            |
| **Evidence**   | `src/hooks/use-toast.ts:71-122`                                                                                                                                                                                                                                                 |
| **Assessment** | Correct                                                                                                                                                                                                                                                                         |
| **What**       | The shadcn/ui toast system uses a Flux/Command pattern: `dispatch()` sends typed action objects (`ADD_TOAST`, `UPDATE_TOAST`, `DISMISS_TOAST`, `REMOVE_TOAST`) to a `reducer` function. Module-scoped `memoryState` + `listeners` array implements a lightweight pub-sub store. |

This is a well-implemented Command + Observer pattern at module scope. The `genId()` function
(`line 24-27`) acts as a simple ID factory.

**Note:** This hook is likely unused — the codebase uses `sonner`'s `toast()` everywhere (confirmed
by imports in all pages). The `Toaster` from `@/components/ui/toaster` and `Sonner` from
`@/components/ui/sonner` are both mounted in `App.tsx:27-28`, which is redundant.

---

### P7 — Template Method: Custom Hook Pattern

|                |                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 5/10                                                                                                                                                                                          |
| **Evidence**   | `src/hooks/useParkingSpots.ts`, `src/hooks/useWaitlist.ts`, `src/hooks/useRecurringBookings.ts`, `src/hooks/useBookingAudit.ts`, `src/hooks/useUserProfile.ts`                                |
| **Assessment** | Correct — structurally consistent                                                                                                                                                             |
| **What**       | All data-fetching hooks follow an identical template: `useState` for data/loading → `useCallback` for fetch function → `useEffect` to trigger on mount → return `{ data, loading, refetch }`. |

This is consistent and predictable. The template is:

```typescript
export const useXxx = () => {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured || !user) { setLoading(false); return; }
    try {
      const { data, error } = await supabase.from('xxx').select('*') ...;
      if (error) console.warn(...);
      else setData(data || []);
    } catch (err) { console.error(...); }
    finally { setLoading(false); }
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, refetch: fetchData };
};
```

**Problem:** None of these hooks use TanStack Query despite `QueryClientProvider` being mounted in
`App.tsx:25`. They all manually re-implement caching, loading states, and refetching that TanStack
Query provides out of the box. This is a significant missed opportunity (see M4).

---

### P8 — Error Boundary (Class-based Lifecycle Pattern)

|                |                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 6/10                                                                                                                                                      |
| **Evidence**   | `src/components/ErrorBoundary.tsx:21-104`                                                                                                                 |
| **Assessment** | Correct                                                                                                                                                   |
| **What**       | Standard React Error Boundary using `getDerivedStateFromError` + `componentDidCatch`. Supports optional `fallback` prop. Shows error details in dev mode. |

Well-implemented. Wraps the entire app at `App.tsx:17`. The reset handler redirects to a hardcoded
path (`/park-it-easy-office/`) which should use `BrowserRouter`'s `basename` instead, but that's a
minor issue.

---

### P9 — Adapter (Informal): Database → UI Type Mapping

|                |                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 4/10                                                                                                                                                                                                                                                           |
| **Evidence**   | `src/pages/Index.tsx:53-61`                                                                                                                                                                                                                                    |
| **Assessment** | Partial (inline, no abstraction)                                                                                                                                                                                                                               |
| **What**       | The `transformedBookings` mapping at `Index.tsx:53-61` converts database column names (`vehicle_type`, `spot_number`, `user_name`) to camelCase UI types (`vehicleType`, `spotNumber`, `userName`). This is an Adapter — translating one interface to another. |

**Problem:** This adapter is inlined in the component and duplicated. `bookingService.ts:260-276`
has a proper version with Zod validation, but it's dead code. The component also casts types
unsafely:

```typescript
// Index.tsx:56-57
duration: booking.duration as 'morning' | 'afternoon' | 'full',
vehicleType: booking.vehicle_type as 'car' | 'motorcycle',
```

These `as` casts bypass type safety. The dead `bookingService.ts` uses `z.enum()` for runtime
validation — strictly better.

---

## Missing Patterns

### M1 — Context Provider for Auth State (Singleton Consumer)

|                |                                                                                                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 9/10                                                                                                                                                                                        |
| **Evidence**   | `src/hooks/useAuth.tsx:5-43` — no Context, each call creates independent state                                                                                                              |
| **Impact**     | 3-6 duplicate Supabase auth subscriptions active simultaneously. Each fires `getSession()` on mount. Potential for stale/inconsistent auth state across components. Wasted network traffic. |

`useAuth` is a plain hook with `useState` + `useEffect`. Every consumer gets an independent copy
of `user` and `loading`. There's no shared state.

**Recommended Implementation:**

```tsx
// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/park-it-easy-office/auth';
  };

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

Wrap in `App.tsx`:

```tsx
<AuthProvider>
  <BrowserRouter ...>
    <Routes>...</Routes>
  </BrowserRouter>
</AuthProvider>
```

---

### M2 — Repository Pattern (Data Access Layer)

|                |                                                                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Importance** | 8/10                                                                                                                                                                                                                                             |
| **Evidence**   | `src/pages/Index.tsx:45-48`, `src/pages/Statistics.tsx:63-66`, `src/pages/Auth.tsx:95-98`, `src/components/BookingDialogWithValidation.tsx:71-76`                                                                                                |
| **Impact**     | Every page/component imports `supabase` directly and writes raw queries inline. Business logic (validation, transformation, error handling) is scattered across 4+ files. Changing the `bookings` table schema requires updating every consumer. |

`bookingService.ts` and `authService.ts` were written to solve this exact problem — but they are
dead code (zero imports confirmed). All actual data access is raw Supabase calls in components.

**Recommended Implementation:**

Either resurrect the existing services or use TanStack Query with a thin repository layer:

```typescript
// src/repositories/bookingRepository.ts
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type BookingRow = Tables<'bookings'>;

export const bookingRepository = {
  async getAll(): Promise<BookingRow[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('date', { ascending: true });
    if (error) throw error;
    return data ?? [];
  },

  async getBySpotAndDate(spotNumber: number, date: string): Promise<BookingRow[]> {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('spot_number', spotNumber)
      .eq('date', date);
    if (error) throw error;
    return data ?? [];
  },

  async create(booking: Omit<BookingRow, 'id' | 'created_at'>): Promise<BookingRow> {
    const { data, error } = await supabase.from('bookings').insert(booking).select().single();
    if (error) throw error;
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) throw error;
  },
};
```

---

### M3 — Memoization (Derived State Caching)

|                |                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Importance** | 8/10                                                                                                                                                                                                                           |
| **Evidence**   | `src/pages/Statistics.tsx:82-498`, `src/pages/Index.tsx:130-191`                                                                                                                                                               |
| **Impact**     | ~450 lines of expensive computation in `Statistics.tsx` (date filtering, grouping, statistical calculations, trend analysis) re-execute on every render. No `useMemo` anywhere in the file. Same for ~60 lines in `Index.tsx`. |

Every state change (including unrelated ones) causes full recalculation of:

- `filterByDateRange` results (lines 101-106, called 4 times)
- `dayOfWeekCounts` loop (lines 153-161)
- `calculateOccupation` (lines 186-205, called 2 times)
- `getDailyOccupancy` (lines 208-234, called 2 times)
- `calculateStreak` (lines 334-390)
- `calculateFairnessScore` (lines 578-593)
- `daySuccessRates` computation (lines 479-496)
- `threeMonthTrend` (lines 463)

**Recommended Implementation:**

```typescript
// Wrap expensive computations in useMemo
const thisWeekBookings = useMemo(
  () => filterByDateRange(thisWeekStart, thisWeekEnd),
  [bookings, thisWeekStart, thisWeekEnd]
);

const streakData = useMemo(() => calculateStreak(), [myBookingsSorted]);

const fairnessScore = useMemo(() => calculateFairnessScore(), [fairness, userBookingCounts]);
```

---

### M4 — TanStack Query Integration (Proxy/Cache Pattern)

|                |                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Importance** | 7/10                                                                                                                                                                                                                                                         |
| **Evidence**   | `src/App.tsx:14` — `QueryClient` created but never used for data fetching                                                                                                                                                                                    |
| **Impact**     | `QueryClientProvider` is mounted at app root but zero hooks use `useQuery`/`useMutation`. All 7 custom data hooks manually implement loading states, error handling, and refetching. No request deduplication, background refetching, or cache invalidation. |

The project has `@tanstack/react-query` installed and the provider is set up, but every hook uses
raw `useState` + `useEffect` + `supabase.from(...)`. This means:

- No automatic cache invalidation
- No request deduplication (same data fetched multiple times)
- No background refetching
- No optimistic updates
- Manual loading/error state management in every hook

**Recommended Implementation:**

```typescript
// src/hooks/useParkingSpots.ts — refactored with TanStack Query
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useParkingSpots = () => {
  return useQuery({
    queryKey: ['parkingSpots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parking_spots')
        .select('*')
        .eq('is_active', true)
        .order('spot_number');
      if (error) throw error;
      return data;
    },
  });
};
```

---

### M5 — Component Decomposition (Composite Pattern)

|                |                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 7/10                                                                                                                                                                          |
| **Evidence**   | `src/pages/Statistics.tsx` (1,465 LOC), `src/pages/Index.tsx` (513 LOC)                                                                                                       |
| **Impact**     | God Components that mix data fetching, business logic, and presentation. Impossible to test individual sections. Any state change triggers full re-render of the entire page. |

`Statistics.tsx` contains:

- Data fetching (lines 55-80)
- 12+ statistical computations (lines 82-498)
- Personal profile calculations (lines 265-331)
- Streak calculation (lines 334-390)
- Trend predictions (lines 446-475)
- ~1000 lines of JSX

**Recommended decomposition:**

```
Statistics.tsx (orchestrator, ~50 LOC)
├── FairnessSection.tsx
├── OverviewStatsGrid.tsx
├── VehicleBreakdown.tsx
├── WeeklyOccupancyChart.tsx
├── MonthlyCalendar.tsx
├── BookingLeaders.tsx
├── PersonalProfile.tsx
├── BookingStreak.tsx
├── TrendsAndPredictions.tsx
└── UnmetDemand.tsx
```

Each section gets its own component with memoized props.

---

### M6 — Value Objects / DTOs

|                |                                                                                                                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Importance** | 5/10                                                                                                                                                                                                 |
| **Evidence**   | `src/pages/Index.tsx:14-22`, `src/pages/Statistics.tsx:29-37`, `src/components/ParkingSpotCard.tsx:7-13`, `src/components/StatisticsCard.tsx:4-11`                                                   |
| **Impact**     | The `Booking` interface is redefined 4 times across different files with slightly different shapes (some use `vehicleType`, the DB uses `vehicle_type`). No single source of truth for domain types. |

Four separate `Booking` interface definitions:

| File                       | Shape                                                  |
| -------------------------- | ------------------------------------------------------ |
| `Index.tsx:14-22`          | `vehicleType`, `spotNumber`, `createdAt`               |
| `Statistics.tsx:29-37`     | `vehicle_type`, `spot_number`, `created_at` (DB shape) |
| `ParkingSpotCard.tsx:7-13` | `vehicleType` but no `spotNumber`                      |
| `StatisticsCard.tsx:4-11`  | `vehicleType`, `spotNumber`                            |
| `bookingService.ts:11-18`  | `vehicleType`, `spotNumber` (dead code)                |

**Recommended Implementation:**

```typescript
// src/types/booking.ts
import type { Tables } from '@/integrations/supabase/types';

// Database shape (source of truth)
export type BookingRow = Tables<'bookings'>;

// UI shape (transformed)
export interface Booking {
  id: string;
  date: string;
  duration: 'morning' | 'afternoon' | 'full';
  vehicleType: 'car' | 'motorcycle';
  userName: string;
  spotNumber: number;
  createdAt?: string;
}

// Transformer (single place for DB → UI mapping)
export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    date: row.date,
    duration: row.duration,
    vehicleType: row.vehicle_type,
    userName: row.user_name,
    spotNumber: row.spot_number,
    createdAt: row.created_at,
  };
}
```

---

## Anti-Patterns Found

### A1 — Dead Service Layer

|              |                                                                                                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | High                                                                                                                                                                                                                                                               |
| **Evidence** | `src/services/authService.ts` (240 LOC), `src/services/bookingService.ts` (364 LOC)                                                                                                                                                                                |
| **Impact**   | 604 lines of well-structured code (Zod validation, proper error handling, type-safe transformations) that is never imported. The live code duplicates this logic in worse form across page components. Confuses developers about where business logic should live. |

**Verification:** `grep -r "authService\|bookingService" src/` returns zero results outside the
service files themselves.

These services represent the _intended_ architecture — Service Layer with Repository-like data
access and Zod-validated DTOs. The actual architecture bypasses them completely.

**Recommended action:** Either wire the services into the hooks/components, or delete them and
move their Zod schemas into the repository layer. Do not keep dead code as "documentation."

---

### A2 — God Component

|              |                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | High                                                                                                                                                                                                                                                                                 |
| **Evidence** | `src/pages/Statistics.tsx:1-1465`                                                                                                                                                                                                                                                    |
| **Impact**   | Single component responsible for: (1) data fetching, (2) 12+ statistical computations, (3) personal profile analysis, (4) streak tracking, (5) trend prediction, (6) rendering 10+ card sections. Violates Single Responsibility. Impossible to test or memoize individual sections. |

The component body (before `return`) spans lines 39-618 — 580 lines of pure computation with zero
`useMemo` calls.

---

### A3 — Prop Drilling Over Context

|              |                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | Medium                                                                                                                                                                                                                                                 |
| **Evidence** | `useAuth()` called independently in 6+ locations                                                                                                                                                                                                       |
| **Impact**   | Instead of providing auth state once via Context and consuming it everywhere, each component independently subscribes to Supabase auth. This is the "Independent Subscription" anti-pattern — the opposite of "Prop Drilling" but equally problematic. |

---

### A4 — Phantom Dependency (Installed but Unused)

|              |                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Medium                                                                                                                                                          |
| **Evidence** | `src/App.tsx:4,14,25` — TanStack Query installed, provider mounted, never used                                                                                  |
| **Impact**   | Bundle size increase for no benefit. Misleads developers into thinking the app uses query caching. Every custom hook reimplements what TanStack Query provides. |

```typescript
// App.tsx:14 — created but pointless
const queryClient = new QueryClient();

// App.tsx:25 — wraps the app but nothing uses it
<QueryClientProvider client={queryClient}>
```

---

### A5 — Dual Toast System

|              |                                                                                                                                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Low                                                                                                                                                                                                                                                                         |
| **Evidence** | `src/App.tsx:27-28`, `src/hooks/use-toast.ts:1-186`                                                                                                                                                                                                                         |
| **Impact**   | Two toast systems mounted simultaneously: the shadcn/ui `<Toaster />` (line 27) and Sonner `<Sonner />` (line 28). All application code uses Sonner's `toast()` from `'sonner'`. The shadcn toast hook (`use-toast.ts`, 186 LOC) and its Toaster component are dead weight. |

---

### A6 — Environment Validation Duplication

|              |                                                                                                                                                                                                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Low                                                                                                                                                                                                                                                                              |
| **Evidence** | `src/lib/env.ts:7-20` vs `src/integrations/supabase/client.ts:8`                                                                                                                                                                                                                 |
| **Impact**   | Two independent systems check if Supabase is configured. `env.ts` uses Zod to validate env vars and exports `isSupabaseConfigured`. `client.ts` has its own `isSupabaseConfigured` boolean. All hooks import from `client.ts`, making `env.ts`'s export unused for this purpose. |

---

## Summary

The codebase shows evidence of two architectural eras colliding:

1. **V1 (Dead):** A well-structured service layer (`authService.ts`, `bookingService.ts`) with Zod
   validation, proper DTOs, and Repository-like data access. This code was never wired in.

2. **V2 (Live):** Direct Supabase calls in page components, `useState`/`useEffect` hooks ignoring
   TanStack Query, no shared auth context, and God Components doing everything inline.

The project installed the right libraries (TanStack Query, Zod) and wrote the right abstractions
(Service Layer, Zod schemas), but the actual running code bypasses all of them. This results in:

- **6 duplicate auth subscriptions** where 1 would suffice
- **~450 lines of unmemoized computation** recalculated on every render
- **604 lines of dead service code** while components duplicate the logic
- **4 duplicate Booking type definitions** with no single source of truth
- **TanStack Query** installed but providing zero value

The Supabase client Singleton and the custom hook template are the two patterns that work correctly.
Everything else is either bypassed, duplicated, or missing.

---

## Top 5 Prioritized Improvements

### 1. Add AuthContext Provider (Risk reduction: -2 points)

**Files:** Create `src/contexts/AuthContext.tsx`, modify `src/App.tsx`, `src/hooks/useAuth.tsx`
**Effort:** ~1 hour
**Why first:** Eliminates 3-5 duplicate auth subscriptions, fixes potential inconsistent state,
and is the smallest change with the highest impact. Every other consumer of `useAuth()` benefits
immediately with zero changes.

### 2. Decompose Statistics.tsx + Add useMemo (Risk reduction: -1.5 points)

**Files:** `src/pages/Statistics.tsx` → 8-10 smaller components
**Effort:** ~3 hours
**Why second:** The 1,465 LOC God Component with 450+ lines of unmemoized computation is the
biggest maintainability and performance problem. Decomposition enables memoization at the section
level.

### 3. Wire TanStack Query into Data Hooks (Risk reduction: -1.5 points)

**Files:** All 7 hooks in `src/hooks/`
**Effort:** ~2 hours
**Why third:** The infrastructure is already mounted (`App.tsx:25`). Converting `useState`+`useEffect`
hooks to `useQuery` gives automatic caching, deduplication, background refetch, and loading/error
states for free. Removes ~200 lines of boilerplate.

### 4. Create Shared Domain Types + Repository Layer (Risk reduction: -1 point)

**Files:** Create `src/types/booking.ts`, `src/repositories/bookingRepository.ts`
**Effort:** ~2 hours
**Why fourth:** Eliminates 4 duplicate `Booking` interfaces, centralizes the DB→UI adapter, and
creates the single data access point that all hooks/components should use. Either revive the dead
services or replace them with this lighter approach.

### 5. Delete Dead Code (Risk reduction: -0.5 points)

**Files:** `src/services/authService.ts`, `src/services/bookingService.ts`, `src/hooks/use-toast.ts`
**Effort:** ~15 minutes
**Why fifth:** 790 lines of dead code (604 in services + 186 in use-toast) that confuses
developers about the intended architecture. Extract any useful Zod schemas into the new repository
layer first, then delete. Remove the duplicate `<Toaster />` from `App.tsx:27`.
