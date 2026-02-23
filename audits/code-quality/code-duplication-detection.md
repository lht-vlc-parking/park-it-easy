# Code Duplication Detection Audit

**Date:** 2026-02-23
**Scope:** All `src/` files — pages, components, hooks, services, integrations, config (~9,493 lines)
**Duplication Rating: 3 / 10** (severe — estimated ~18% redundant or dead-duplicate code)

---

## Summary

| Metric                           | Value        |
| -------------------------------- | ------------ |
| Total lines in `src/` (non-test) | ~9,493       |
| Estimated dead/duplicate lines   | ~1,700       |
| Dead code (unused files/systems) | ~1,007 lines |
| Near-duplicate logic             | ~450 lines   |
| Structural boilerplate           | ~250 lines   |
| Duplication percentage           | **~18%**     |

---

## Findings

### F1 — Exact Duplicate: `Booking` Interface Defined 5 Times

|                   |                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**      | **Critical**                                                                                                                                                                               |
| **Importance**    | 10/10                                                                                                                                                                                      |
| **Category**      | Exact / Near Duplicate (Data Type)                                                                                                                                                         |
| **Duplication %** | 100% (same concept, 5 definitions)                                                                                                                                                         |
| **Evidence**      | `src/pages/Index.tsx:14-22`, `src/pages/Statistics.tsx:29-37`, `src/components/ParkingSpotCard.tsx:7-13`, `src/components/StatisticsCard.tsx:4-11`, `src/services/bookingService.ts:11-18` |

**What:** Five separate `Booking` interface definitions across the codebase. Worse, they are **inconsistent**:

| File                       | Fields                                                                          | Casing         |
| -------------------------- | ------------------------------------------------------------------------------- | -------------- |
| `Index.tsx:14-22`          | id, date, time, duration, vehicleType, userName, spotNumber, createdAt          | camelCase      |
| `Statistics.tsx:29-37`     | id, date, time, duration, vehicle_type, user_name, spot_number, created_at      | **snake_case** |
| `ParkingSpotCard.tsx:7-13` | id, date, time, duration, vehicleType, userName (missing spotNumber, createdAt) | camelCase      |
| `StatisticsCard.tsx:4-11`  | id, date, time, duration, vehicleType, userName, spotNumber (missing createdAt) | camelCase      |
| `bookingService.ts:11-18`  | id, date, time, duration, vehicleType, userName, spotNumber, createdAt          | camelCase      |

The snake_case variant in `Statistics.tsx` matches the raw Supabase row shape, while the others use a camelCase-transformed shape. This means two parallel "Booking" types exist with no shared definition.

**Why it matters:** Any schema change (e.g., adding a `notes` field) requires updating 5 files. The casing inconsistency causes runtime bugs when passing data between components that assume different shapes.

**Remediation — single source of truth:**

```ts
// src/types/booking.ts
import type { Database } from '@/integrations/supabase/types';

/** Raw DB row — snake_case, matches Supabase exactly */
export type BookingRow = Database['public']['Tables']['bookings']['Row'];

/** App-level model — camelCase, used after transformation */
export interface Booking {
  id: string;
  date: string;
  time: string;
  duration: number;
  vehicleType: string;
  userName: string;
  spotNumber: number;
  createdAt: string;
}

/** Transform a DB row to the app model */
export function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    duration: row.duration,
    vehicleType: row.vehicle_type,
    userName: row.user_name,
    spotNumber: row.spot_number,
    createdAt: row.created_at,
  };
}
```

Then delete all 5 local definitions and import from `@/types/booking`.

**Effort:** ~30 minutes

---

### F2 — Dead Code: Entire Service Layer Unused (~604 lines)

|                   |                                                                             |
| ----------------- | --------------------------------------------------------------------------- |
| **Severity**      | **Critical**                                                                |
| **Importance**    | 9/10                                                                        |
| **Category**      | Dead Duplicate Code                                                         |
| **Duplication %** | 100% (duplicates logic in pages/components, never called)                   |
| **Evidence**      | `src/services/authService.ts:1-240`, `src/services/bookingService.ts:1-364` |

**What:** Two service files totaling 604 lines are dead code:

- **`authService.ts` (240 lines)** — Contains `AuthService` class with `signIn()`, `signUp()`, `resetPassword()`, `signOut()`, Zod validation schemas, and `getAuthRedirectUrl()`. **Not imported by any production file.** All auth logic is duplicated inline in `Auth.tsx:90-280`.
- **`bookingService.ts` (364 lines)** — Contains `BookingService` class with `createBooking()`, `deleteBooking()`, `fetchBookings()`, `overlaps()`, validation, and constants like `MAX_CAR_BOOKINGS`. **Only imported by its own test file.** All booking CRUD is duplicated inline in `Index.tsx` and `BookingDialogWithValidation.tsx`.

**Why it matters:** 604 lines of code that will never execute but still confuses developers, shows up in searches, and creates the illusion of an abstraction layer that doesn't actually exist.

**Remediation:** Two options:

1. **Quick fix — delete both files** and their test files. Pages already contain all the logic. (~5 minutes)
2. **Proper fix — adopt the service layer** by refactoring `Index.tsx` and `Auth.tsx` to delegate to the services. This eliminates the inline duplication in pages. (~2-4 hours)

Option 2 is recommended if the services have better validation (they do — Zod schemas, proper error handling). Option 1 if you want to minimize churn.

**Effort:** 5 min (delete) or 2-4 hours (adopt)

---

### F3 — Dead Code: Unused shadcn Toast System (~324 lines)

|                   |                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **High**                                                                                                                                        |
| **Importance**    | 8/10                                                                                                                                            |
| **Category**      | Dead Duplicate Code (Dual Toast System)                                                                                                         |
| **Duplication %** | 100% (entire shadcn toast infrastructure is unused)                                                                                             |
| **Evidence**      | `src/hooks/use-toast.ts:1-186`, `src/components/ui/toast.tsx:1-111`, `src/components/ui/toaster.tsx:1-24`, `src/components/ui/use-toast.ts:1-3` |

**What:** The app mounts **two** toast systems in `App.tsx:1-2`:

```tsx
import { Toaster } from '@/components/ui/toaster'; // shadcn — UNUSED
import { Toaster as Sonner } from '@/components/ui/sonner'; // sonner — USED
```

Every file that calls `toast()` imports from `'sonner'` directly:

- `src/pages/Auth.tsx` — `import { toast } from 'sonner'`
- `src/pages/Index.tsx` — `import { toast } from 'sonner'`
- `src/pages/Statistics.tsx` — `import { toast } from 'sonner'`
- `src/components/BookingDialogWithValidation.tsx` — `import { toast } from 'sonner'`
- `src/hooks/useParkingSpots.ts` — `import { toast } from 'sonner'`
- `src/hooks/useWaitlist.ts` — `import { toast } from 'sonner'`
- `src/hooks/useRecurringBookings.ts` — `import { toast } from 'sonner'`

**Zero** files import from `@/hooks/use-toast` or `@/components/ui/use-toast`.

**Why it matters:** 324 lines of dead infrastructure. The shadcn `<Toaster />` is mounted in the DOM and renders on every page, but nothing triggers it. It adds bundle weight and confusion.

**Remediation:**

```diff
// src/App.tsx
- import { Toaster } from "@/components/ui/toaster";
  import { Toaster as Sonner } from "@/components/ui/sonner";

  // In JSX:
- <Toaster />
  <Sonner />
```

Then delete:

- `src/hooks/use-toast.ts`
- `src/components/ui/toast.tsx`
- `src/components/ui/toaster.tsx`
- `src/components/ui/use-toast.ts`

**Effort:** ~10 minutes

---

### F4 — Dead Code: `StatisticsCard.tsx` Never Imported (79 lines)

|                   |                                                               |
| ----------------- | ------------------------------------------------------------- |
| **Severity**      | **Medium**                                                    |
| **Importance**    | 5/10                                                          |
| **Category**      | Dead Duplicate Code                                           |
| **Duplication %** | 100% (simplified copy of stats rendering in `Statistics.tsx`) |
| **Evidence**      | `src/components/StatisticsCard.tsx:1-79`                      |

**What:** `StatisticsCard.tsx` defines a `Booking` interface and a card component that renders booking statistics. It is **never imported** by any file in the project. The `Statistics.tsx` page renders its own statistics cards directly.

**Remediation:** Delete the file.

**Effort:** ~2 minutes

---

### F5 — Near Duplicate: `fetchBookings` in Index.tsx vs Statistics.tsx

|                   |                                                               |
| ----------------- | ------------------------------------------------------------- |
| **Severity**      | **High**                                                      |
| **Importance**    | 8/10                                                          |
| **Category**      | Near Duplicate (Data Fetching)                                |
| **Duplication %** | ~80% (same query, different post-processing)                  |
| **Evidence**      | `src/pages/Index.tsx:40-70`, `src/pages/Statistics.tsx:59-80` |

**What:** Both pages independently fetch all bookings from Supabase with the same query:

```ts
// Index.tsx:48
const { data, error } = await supabase
  .from('bookings')
  .select('*')
  .order('date', { ascending: true });

// Statistics.tsx:65
const { data: bookingsData, error: bookingsError } = await supabase
  .from('bookings')
  .select('*')
  .order('date', { ascending: true });
```

The difference: `Index.tsx` transforms the result from snake_case to camelCase via a `.map()`, while `Statistics.tsx` keeps the raw snake_case rows. This is a direct consequence of F1 (inconsistent `Booking` types).

**Why it matters:** If the query needs to change (e.g., adding a filter, changing sort), it must be updated in two places. The two pages can silently drift.

**Remediation:**

```ts
// src/hooks/useBookings.ts
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';
import { toBooking, type Booking, type BookingRow } from '@/types/booking';

export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .order('date', { ascending: true });

      if (error) throw error;
      setBookings((data as BookingRow[]).map(toBooking));
    } catch (e) {
      console.warn('Failed to fetch bookings:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return { bookings, loading, refetch: fetchBookings };
}
```

Both `Index.tsx` and `Statistics.tsx` then import `useBookings()` instead of duplicating the fetch logic.

**Effort:** ~45 minutes

---

### F6 — Near Duplicate: Auth Session Check in `useAuth.tsx` vs `Auth.tsx`

|                   |                                                          |
| ----------------- | -------------------------------------------------------- |
| **Severity**      | **High**                                                 |
| **Importance**    | 7/10                                                     |
| **Category**      | Near Duplicate (Auth Logic)                              |
| **Duplication %** | ~85%                                                     |
| **Evidence**      | `src/hooks/useAuth.tsx:9-32`, `src/pages/Auth.tsx:26-51` |

**What:** Both files implement the same `getSession()` + `onAuthStateChange()` subscription pattern:

```ts
// useAuth.tsx:10-27
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    setUser(session?.user ?? null);
    setLoading(false);
  });
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user ?? null);
  });
  return () => subscription.unsubscribe();
}, []);

// Auth.tsx:27-48
useEffect(() => {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session) navigate('/');
  });
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) navigate('/');
  });
  return () => subscription.unsubscribe();
}, [navigate]);
```

The logic is structurally identical — `getSession` then `onAuthStateChange` then cleanup — with only the callback body differing.

**Remediation:** `Auth.tsx` should consume `useAuth()` and react to user state changes:

```ts
// In Auth.tsx — replace the manual session check
const { user, loading } = useAuth();

useEffect(() => {
  if (!loading && user) navigate('/');
}, [user, loading, navigate]);
```

This eliminates the duplicate subscription entirely.

**Effort:** ~20 minutes

---

### F7 — Exact Duplicate: `overlaps()` Function

|                   |                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Severity**      | **Medium**                                                                                       |
| **Importance**    | 6/10                                                                                             |
| **Category**      | Exact Duplicate (Utility Function)                                                               |
| **Duplication %** | 100%                                                                                             |
| **Evidence**      | `src/components/BookingDialogWithValidation.tsx:100-106`, `src/services/bookingService.ts:56-59` |

**What:** The time-overlap check is implemented identically in two places:

```ts
// BookingDialogWithValidation.tsx:100-106
const overlaps = (startA: number, endA: number, startB: number, endB: number) => {
  return startA < endB && startB < endA;
};

// bookingService.ts:56-59
private static overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}
```

**Why it matters:** Since `bookingService.ts` is dead code (F2), the real risk is that this utility has no single home. When the service is deleted, the only copy lives buried inside a dialog component.

**Remediation:**

```ts
// src/utils/timeUtils.ts
/** Check if two time ranges [startA, endA) and [startB, endB) overlap */
export function timeRangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number
): boolean {
  return startA < endB && startB < endA;
}
```

**Effort:** ~10 minutes

---

### F8 — Structural Duplicate: Hook Fetch Pattern (6 hooks)

|                   |                                                                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**      | **High**                                                                                                                                                                                     |
| **Importance**    | 7/10                                                                                                                                                                                         |
| **Category**      | Structural Duplicate (Boilerplate)                                                                                                                                                           |
| **Duplication %** | ~90% structural similarity                                                                                                                                                                   |
| **Evidence**      | `src/hooks/useParkingSpots.ts`, `src/hooks/useStatistics.ts`, `src/hooks/useWaitlist.ts`, `src/hooks/useUserProfile.ts`, `src/hooks/useRecurringBookings.ts`, `src/hooks/useBookingAudit.ts` |

**What:** All 6 data-fetching hooks follow the exact same structure:

```ts
export function useXxx() {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!isSupabaseConfigured) {
      // set mock data or return
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.from('table').select('*');
      if (error) throw error;
      setData(data);
    } catch (error) {
      console.warn('Failed to fetch xxx:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refetch: fetchData };
}
```

The only variation is: table name, return type, and mock data. The `isSupabaseConfigured` guard, try/catch/finally, `console.warn`, `setLoading` — all identical.

**Why it matters:** ~250 lines of pure boilerplate across 6 files. Every new data entity requires copying an existing hook and changing 3 values. Bug fixes to the pattern (e.g., adding retry logic, error state) must be applied to all 6 files.

**Remediation — generic fetcher factory:**

```ts
// src/hooks/useSupabaseQuery.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

interface UseSupabaseQueryOptions<T> {
  table: string;
  select?: string;
  mockData?: T;
  transform?: (data: any[]) => T;
  orderBy?: { column: string; ascending?: boolean };
}

export function useSupabaseQuery<T>(options: UseSupabaseQueryOptions<T>) {
  const { table, select = '*', mockData, transform, orderBy } = options;
  const [data, setData] = useState<T | null>(mockData ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    if (!isSupabaseConfigured) {
      if (mockData !== undefined) setData(mockData);
      setLoading(false);
      return;
    }
    try {
      let query = supabase.from(table).select(select);
      if (orderBy) query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      const { data: rows, error: err } = await query;
      if (err) throw err;
      setData(transform ? transform(rows) : (rows as unknown as T));
    } catch (e) {
      console.warn(`Failed to fetch ${table}:`, e);
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [table, select, orderBy?.column, orderBy?.ascending]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
```

Then each hook becomes a thin wrapper:

```ts
// src/hooks/useParkingSpots.ts
export function useParkingSpots() {
  return useSupabaseQuery({
    table: 'parking_spots',
    mockData: MOCK_SPOTS,
  });
}
```

**Effort:** ~1.5 hours

---

### F9 — Near Duplicate: Personal Statistics Computation

|                   |                                                                   |
| ----------------- | ----------------------------------------------------------------- |
| **Severity**      | **Medium**                                                        |
| **Importance**    | 6/10                                                              |
| **Category**      | Near Duplicate (Business Logic)                                   |
| **Duplication %** | ~70%                                                              |
| **Evidence**      | `src/pages/Index.tsx:141-191`, `src/pages/Statistics.tsx:263-331` |

**What:** Both pages independently compute personal booking statistics using the same algorithmic approach:

| Computation         | Index.tsx                 | Statistics.tsx                |
| ------------------- | ------------------------- | ----------------------------- |
| Favorite spot       | `spotCounts` + sort       | `spotCounts` + sort           |
| Preferred time slot | `timeCounts` + categorize | `durationCounts` + categorize |
| Weekly frequency    | `weeklyBookings` count    | `dayOfWeekCounts` + reduce    |
| Avg bookings/week   | manual date range calc    | manual date range calc        |

The core algorithms (counting frequencies, finding mode, date range calculations) are the same with different variable names.

**Remediation:**

```ts
// src/utils/bookingStats.ts
export function computePersonalStats(bookings: Booking[], userId: string) {
  const userBookings = bookings.filter(b => b.userName === userId);
  return {
    favoriteSpot: mode(userBookings.map(b => b.spotNumber)),
    preferredTime: categorizeTimeSlot(mode(userBookings.map(b => b.time))),
    weeklyAverage: computeWeeklyAverage(userBookings),
    totalBookings: userBookings.length,
  };
}
```

**Effort:** ~1 hour

---

### F10 — Data Duplication: `isSupabaseConfigured` Defined Twice

|                   |                                                              |
| ----------------- | ------------------------------------------------------------ |
| **Severity**      | **Low**                                                      |
| **Importance**    | 4/10                                                         |
| **Category**      | Data Duplication (Config Check)                              |
| **Duplication %** | 100% (same concept, different implementation)                |
| **Evidence**      | `src/integrations/supabase/client.ts:8`, `src/lib/env.ts:75` |

**What:** Two implementations of the same boolean:

```ts
// client.ts:8
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

// env.ts:75
export const isSupabaseConfigured = env.success; // uses Zod-validated env
```

All 7 hooks import from `client.ts`. The `env.ts` version is never used outside of `env.ts` itself.

**Remediation:** Delete the export from `env.ts`, or wire `client.ts` to use `env.ts` as its source of truth. The Zod-validated version is technically more robust, so the better option is:

```ts
// client.ts
import { env, isSupabaseConfigured } from '@/lib/env';
// use env.VITE_SUPABASE_URL instead of import.meta.env directly
```

**Effort:** ~15 minutes

---

## Summary Table

| Finding   | Category             | Severity | Importance | Duplicated Lines | Effort      |
| --------- | -------------------- | -------- | ---------- | ---------------- | ----------- |
| F1        | Exact / Type         | Critical | 10/10      | ~50              | 30 min      |
| F2        | Dead Duplicate       | Critical | 9/10       | ~604             | 5 min–4 hr  |
| F3        | Dead Duplicate       | High     | 8/10       | ~324             | 10 min      |
| F4        | Dead Duplicate       | Medium   | 5/10       | ~79              | 2 min       |
| F5        | Near Duplicate       | High     | 8/10       | ~60              | 45 min      |
| F6        | Near Duplicate       | High     | 7/10       | ~40              | 20 min      |
| F7        | Exact Duplicate      | Medium   | 6/10       | ~14              | 10 min      |
| F8        | Structural Duplicate | High     | 7/10       | ~250             | 1.5 hr      |
| F9        | Near Duplicate       | Medium   | 6/10       | ~120             | 1 hr        |
| F10       | Data Duplication     | Low      | 4/10       | ~6               | 15 min      |
| **Total** |                      |          |            | **~1,547**       | **~5–8 hr** |

---

## Top 5 Prioritized Fixes

### 1. Create canonical `Booking` type (F1) — 30 min

**Impact:** Eliminates 5 duplicate definitions, fixes the camelCase/snake_case inconsistency, and unblocks F5.

### 2. Delete unused shadcn toast system (F3) — 10 min

**Impact:** Removes 324 lines of dead code, eliminates a duplicate `<Toaster />` mount in the DOM, reduces bundle size.

### 3. Extract `useBookings` hook (F5) — 45 min

**Impact:** Eliminates duplicate data fetching between Index and Statistics, builds on the canonical `Booking` type from fix 1.

### 4. Delete dead service layer or adopt it (F2) — 5 min or 2-4 hr

**Impact:** Removes 604 lines of confusion (quick) or properly centralizes auth + booking logic (thorough).

### 5. Create generic `useSupabaseQuery` hook (F8) — 1.5 hr

**Impact:** Replaces ~250 lines of boilerplate across 6 hooks with a single reusable factory. Makes adding new data entities trivial.

---

## Recommended Utilities Module

Based on the duplications found, the following shared modules should be created:

```
src/
├── types/
│   └── booking.ts          # F1: Canonical Booking type + BookingRow + toBooking()
├── hooks/
│   ├── useSupabaseQuery.ts # F8: Generic Supabase fetch hook factory
│   └── useBookings.ts      # F5: Shared booking data hook (uses useSupabaseQuery)
└── utils/
    ├── timeUtils.ts        # F7: timeRangesOverlap() and time formatting helpers
    └── bookingStats.ts     # F9: Personal statistics computation (favoriteSpot, weeklyAverage, etc.)
```

These 5 files (~200 lines total) would eliminate ~1,100 lines of duplication across the codebase.

---

## Appendix: Dead Code Inventory

| File                                | Lines     | Status                 | Reason                                     |
| ----------------------------------- | --------- | ---------------------- | ------------------------------------------ |
| `src/services/authService.ts`       | 240       | Dead — never imported  | Logic duplicated in `Auth.tsx`             |
| `src/services/bookingService.ts`    | 364       | Dead — test-only       | Logic duplicated in `Index.tsx` + dialog   |
| `src/components/StatisticsCard.tsx` | 79        | Dead — never imported  | Simplified copy of `Statistics.tsx` output |
| `src/hooks/use-toast.ts`            | 186       | Dead — never imported  | Replaced by sonner                         |
| `src/components/ui/toast.tsx`       | 111       | Dead — never imported  | Part of unused shadcn toast system         |
| `src/components/ui/toaster.tsx`     | 24        | Dead — mounted, unused | Renders but nothing triggers it            |
| `src/components/ui/use-toast.ts`    | 3         | Dead — never imported  | Re-export shim for unused hook             |
| **Total**                           | **1,007** |                        |                                            |
