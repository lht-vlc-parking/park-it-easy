# Resilience & Fault Tolerance Audit

**Date:** 2026-02-23
**Scope:** Full `src/` directory
**Version:** park-it-easy-office v2.3.3
**Resilience Rating: 2 / 10**

---

## Executive Summary

The application has **virtually no resilience infrastructure**. Every Supabase call is fire-and-forget with no timeouts, no retries, no circuit breakers, and no client-side caching. TanStack Query is installed and wrapped in a provider (`QueryClientProvider`) but **zero hooks** actually use `useQuery`/`useMutation` — all data fetching is manual `useState`/`useEffect`. The only resilience bright spots are: (1) a top-level `ErrorBoundary` for render crashes, (2) a mock Supabase client fallback when env vars are missing, and (3) hardcoded parking spot fallback data.

---

## Findings

### F1 — QueryClient Instantiated with Zero Configuration

|                    |                                                                                                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                                                                                                                                                                                                                          |
| **Importance**     | 10/10                                                                                                                                                                                                                                                                 |
| **Evidence**       | `src/App.tsx:14`                                                                                                                                                                                                                                                      |
| **What**           | `const queryClient = new QueryClient()` uses all defaults (0 retries in v5, no stale time, no gc time, no global error handler). The entire `QueryClientProvider` wrapping is dead code — no hook in the project calls `useQuery` or `useMutation`.                   |
| **Why it matters** | TanStack Query provides retry, caching, deduplication, stale-while-revalidate, window-focus refetching, and error boundaries out of the box. None of this is leveraged. The app re-fetches from scratch on every mount, with no deduplication of concurrent requests. |

**Remediation:**

```tsx
// src/App.tsx — configure QueryClient with resilience defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 30_000, // 30s before refetch
      gcTime: 5 * 60_000, // 5min garbage collection
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
```

Then **migrate hooks** from `useState`/`useEffect` to `useQuery`/`useMutation` (see F6).

---

### F2 — No HTTP/Supabase Request Timeouts

|                    |                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                                                                                                                                                                                    |
| **Importance**     | 9/10                                                                                                                                                                                                                            |
| **Evidence**       | `src/integrations/supabase/client.ts:12-19`                                                                                                                                                                                     |
| **What**           | The Supabase client is created with only `auth` options. No `global.fetch` override, no `AbortController`, no `db.schema` timeout, no `realtime.timeout`. Every query can hang indefinitely if the network or Supabase is slow. |
| **Why it matters** | A single slow or hung query blocks the UI indefinitely — `loading` state never resolves, the spinner spins forever. Users have no recourse except a manual page reload.                                                         |

**Remediation:**

```ts
// src/integrations/supabase/client.ts
const SUPABASE_TIMEOUT_MS = 15_000;

export const supabase: SupabaseClient<Database> = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: (url, options = {}) => {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
          return fetch(url, { ...options, signal: controller.signal }).finally(() =>
            clearTimeout(id)
          );
        },
      },
    })
  : /* mock client */ ...;
```

---

### F3 — No Retry Logic on Any Data Fetch

|                    |                                                                                                                                                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                                                                                                                                                                                                               |
| **Importance**     | 9/10                                                                                                                                                                                                                                                       |
| **Evidence**       | `src/hooks/useParkingSpots.ts:24-58`, `src/hooks/useStatistics.ts:37-78`, `src/hooks/useWaitlist.ts:27-44`, `src/hooks/useRecurringBookings.ts:21-37`, `src/hooks/useBookingAudit.ts:19-36`, `src/pages/Index.tsx:40-69`, `src/pages/Statistics.tsx:59-80` |
| **What**           | Every data-fetching function follows the same pattern: single `await supabase.from(...).select(...)` inside a `try/catch`. If the request fails (transient network error, 5xx, rate limit), it logs to console and shows a toast. **No automatic retry.**  |
| **Why it matters** | Transient failures (Wi-Fi reconnection, CDN blip, Supabase cold start) are common in SPAs. Without retry, users see errors for issues that would self-heal in 1-2 seconds.                                                                                 |

**Remediation (drop-in utility):**

```ts
// src/lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelay = 1000 } = {}
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * 2 ** attempt + Math.random() * 500;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Unreachable');
}
```

Usage in a hook:

```ts
const { data, error } = await withRetry(() =>
  supabase.from('bookings').select('*').order('date', { ascending: true })
);
```

Better long-term: migrate to TanStack Query which handles this natively.

---

### F4 — `Promise.all` Without Individual Error Isolation

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Importance**     | 8/10                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Evidence**       | `src/hooks/useParkingSpots.ts:26-36`, `src/hooks/useStatistics.ts:48-54`                                                                                                                                                                                                                                                                                                                                                                                                |
| **What**           | `useParkingSpots` fires `Promise.all([spotsQuery, activeSpotsQuery])`. `useStatistics` fires `Promise.all` with **5 parallel queries**. Supabase queries don't throw on query-level errors (they return `{ data, error }`), so `Promise.all` won't reject on individual query failures. However, if the underlying `fetch` throws (network down, CORS, timeout), the entire `Promise.all` rejects and **all 5 results are lost** — even if 4 of 5 would have succeeded. |
| **Why it matters** | A single flaky query (e.g., a view that takes longer) can prevent all statistics from rendering. Partial data is better than no data.                                                                                                                                                                                                                                                                                                                                   |

**Remediation:**

```ts
// Use Promise.allSettled to isolate failures
const results = await Promise.allSettled([
  supabase.from('user_booking_stats').select('*'),
  supabase.from('daily_occupancy_stats').select('*'),
  supabase.from('booking_fairness').select('*').single(),
  supabase.from('spot_popularity').select('*'),
  supabase.from('weekly_booking_trends').select('*').limit(12),
]);

const [userStats, dailyOcc, fairness, spotPop, weeklyTrends] = results.map(r =>
  r.status === 'fulfilled' ? r.value : { data: null, error: r.reason }
);
```

---

### F5 — `signOut` Swallows Errors Silently

|                    |                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                    |
| **Importance**     | 7/10                                                                                                                                                                                                                                                                        |
| **Evidence**       | `src/hooks/useAuth.tsx:34-40`                                                                                                                                                                                                                                               |
| **What**           | `signOut` calls `await supabase.auth.signOut()` with no `try/catch` and no error check, then immediately does a hard redirect via `window.location.href`. If signOut fails (network error, expired token), the redirect still happens, potentially leaving a stale session. |
| **Why it matters** | User believes they're signed out but the session persists server-side. On shared devices this is a security concern. The hard redirect also prevents React from cleaning up state.                                                                                          |

**Remediation:**

```ts
const signOut = async () => {
  if (!isSupabaseConfigured) return;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
      toast.error('Sign out failed. Please try again.');
      return;
    }
  } catch (err) {
    console.error('Sign out network error:', err);
    // Clear local session anyway for security
  }
  window.location.href = '/park-it-easy-office/auth';
};
```

---

### F6 — All Hooks Use Manual useState/useEffect Instead of TanStack Query

|                    |                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                               |
| **Importance**     | 8/10                                                                                                                                                                                                                                                                                                   |
| **Evidence**       | `src/hooks/useParkingSpots.ts:1`, `src/hooks/useStatistics.ts:1`, `src/hooks/useWaitlist.ts:1`, `src/hooks/useRecurringBookings.ts:1`, `src/hooks/useBookingAudit.ts:1`, `src/hooks/useUserProfile.ts:1`                                                                                               |
| **What**           | Every data-fetching hook manually manages `loading`, `error`, and `data` state with `useState` + `useEffect`. This means: no request deduplication, no background refetch, no stale-while-revalidate, no window-focus refetch, no retry, no garbage collection, and no shared cache across components. |
| **Why it matters** | This is the root cause of most resilience gaps. TanStack Query is already installed and the provider is set up — the hooks just don't use it. Migrating would address F1, F3, and partially F2 in one effort.                                                                                          |

**Remediation (example migration for useParkingSpots):**

```ts
import { useQuery } from '@tanstack/react-query';

export const useParkingSpots = () => {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['parking-spots'],
    queryFn: async () => {
      if (!isSupabaseConfigured) return { spots: FALLBACK_SPOTS, activeSpots: [] };
      const [spotsResult, activeSpotsResult] = await Promise.allSettled([
        supabase.from('parking_spots').select('*').eq('is_active', true).order('spot_number'),
        supabase.from('active_parking_spots').select('*').order('spot_number'),
      ]);
      return {
        spots: spotsResult.status === 'fulfilled' ? (spotsResult.value.data ?? []) : FALLBACK_SPOTS,
        activeSpots:
          activeSpotsResult.status === 'fulfilled' ? (activeSpotsResult.value.data ?? []) : [],
      };
    },
    staleTime: 30_000,
    retry: 3,
  });

  return {
    spots: data?.spots ?? [],
    activeSpots: data?.activeSpots ?? [],
    loading: isLoading,
    refetch,
  };
};
```

---

### F7 — No Network Connectivity Detection

|                    |                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                   |
| **Importance**     | 6/10                                                                                                                                                                         |
| **Evidence**       | Searched entire `src/` for `navigator.onLine`, `online`, `offline`, `visibilitychange` — **zero results**                                                                    |
| **What**           | The app has no awareness of network state. If the user goes offline, every interaction triggers a failed Supabase call, resulting in a cascade of error toasts.              |
| **Why it matters** | Mobile/laptop users frequently lose connectivity momentarily. Without detection, the app can't queue operations, show an offline banner, or suppress redundant error toasts. |

**Remediation:**

```tsx
// src/hooks/useOnlineStatus.ts
import { useSyncExternalStore } from 'react';

function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnlineStatus() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true // SSR fallback
  );
}
```

Then gate Supabase calls and show an offline indicator:

```tsx
const isOnline = useOnlineStatus();
if (!isOnline) return <OfflineBanner />;
```

---

### F8 — ErrorBoundary Only Catches Render Errors, Not Async Errors

|                    |                                                                                                                                                                                                                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                          |
| **Importance**     | 6/10                                                                                                                                                                                                                                                                                                                                                |
| **Evidence**       | `src/components/ErrorBoundary.tsx:21-46`                                                                                                                                                                                                                                                                                                            |
| **What**           | The `ErrorBoundary` uses `componentDidCatch` / `getDerivedStateFromError`, which only catches synchronous errors thrown during React rendering. Async errors from `useEffect`, event handlers, and Supabase calls are **not caught** — they go to `console.error` and toast. There is no `window.onerror` or `window.onunhandledrejection` handler. |
| **Why it matters** | Unhandled promise rejections (e.g., Supabase returns a network error that isn't caught) silently fail. The TODO on line 44 (`// TODO: Send to error tracking service`) confirms no error reporting is integrated.                                                                                                                                   |

**Remediation:**

```ts
// src/lib/globalErrorHandler.ts
window.addEventListener('unhandledrejection', event => {
  console.error('Unhandled promise rejection:', event.reason);
  // Report to Sentry/LogRocket/etc.
});

window.addEventListener('error', event => {
  console.error('Uncaught error:', event.error);
  // Report to Sentry/LogRocket/etc.
});
```

Import in `src/main.tsx` before rendering.

---

### F9 — No Stale Data Fallback or Client-Side Cache

|                    |                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                     |
| **Importance**     | 7/10                                                                                                                                                                                                                                                                                                                           |
| **Evidence**       | Searched `src/` for `localStorage`, `sessionStorage`, `cache` — **zero results** (except sidebar keyboard shortcut). No `staleTime`, no `gcTime`, no cached responses.                                                                                                                                                         |
| **What**           | Every component mount triggers a fresh network request. If the request fails, the user sees a loading spinner or error — there is no previously-cached data to fall back on. The `useParkingSpots` hook has hardcoded fallback spots (lines 16-19, 41-44), but this is a config-missing fallback, not a network-failure cache. |
| **Why it matters** | Even 30-second-old data is better than no data. SPAs should show stale data while refetching in the background (stale-while-revalidate pattern).                                                                                                                                                                               |

**Remediation:**

TanStack Query migration (F6) automatically provides in-memory caching. For persistence across page reloads:

```ts
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

const persister = createSyncStoragePersister({ storage: window.localStorage });

persistQueryClient({
  queryClient,
  persister,
  maxAge: 24 * 60 * 60 * 1000, // 24h
});
```

---

### F10 — Auth Session Check Has No Timeout or Error Recovery

|                    |                                                                                                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                |
| **Importance**     | 7/10                                                                                                                                                                                                                                                                                                      |
| **Evidence**       | `src/hooks/useAuth.tsx:16-22`, `src/pages/Auth.tsx:29-37`                                                                                                                                                                                                                                                 |
| **What**           | `supabase.auth.getSession()` is awaited on every page load with no timeout. If Supabase is slow, `loading` stays `true` and the `ProtectedRoute` shows an infinite spinner (`src/components/ProtectedRoute.tsx:13-17`). The `Auth.tsx` page also calls `getSession()` on mount without timeout (line 31). |
| **Why it matters** | Users cannot access the app at all if the initial session check hangs. There is no "retry" button or maximum wait time.                                                                                                                                                                                   |

**Remediation:**

```ts
// Wrap session check with a timeout
const SESSION_TIMEOUT = 5000;

const sessionPromise = supabase.auth.getSession();
const timeoutPromise = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error('Session check timed out')), SESSION_TIMEOUT)
);

try {
  const {
    data: { session },
  } = await Promise.race([sessionPromise, timeoutPromise]);
  setUser(session?.user ?? null);
} catch (error) {
  console.error('Session check failed:', error);
  setUser(null); // Assume logged out on timeout
} finally {
  setLoading(false);
}
```

---

### F11 — Mutation Operations Lack Optimistic Updates and Rollback

|                    |                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                           |
| **Importance**     | 5/10                                                                                                                                                                                                                                                              |
| **Evidence**       | `src/pages/Index.tsx:77-108` (handleConfirmBooking), `src/pages/Index.tsx:110-128` (handleUnbook), `src/hooks/useWaitlist.ts:51-83` (joinWaitlist), `src/hooks/useRecurringBookings.ts:44-66` (createRecurringBooking)                                            |
| **What**           | All write operations follow: call Supabase, check error, toast, then `refetch()`. The UI is not updated optimistically — users wait for the round trip before seeing feedback. If the refetch after mutation fails, the UI is stale until the next manual action. |
| **Why it matters** | Perceived latency is 2x (mutation + refetch). If the mutation succeeds but the refetch fails, the user doesn't see their own action reflected. With TanStack Query's `useMutation` + `onMutate`, this is handled automatically with rollback on error.            |

**Remediation:**

```ts
const bookingMutation = useMutation({
  mutationFn: (booking: BookingInput) => supabase.from('bookings').insert(booking),
  onMutate: async newBooking => {
    await queryClient.cancelQueries({ queryKey: ['bookings'] });
    const previous = queryClient.getQueryData(['bookings']);
    queryClient.setQueryData(['bookings'], old => [...old, { ...newBooking, id: 'temp' }]);
    return { previous };
  },
  onError: (_err, _new, context) => {
    queryClient.setQueryData(['bookings'], context?.previous);
    toast.error('Booking failed');
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['bookings'] }),
});
```

---

### F12 — No Rate Limiting or Debouncing on User-Triggered Fetches

|                    |                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                         |
| **Importance**     | 4/10                                                                                                                                                                                            |
| **Evidence**       | `src/pages/Index.tsx:102` (fetchBookings called on every successful booking), `src/hooks/useWaitlist.ts:76` (fetchMyWaitlist after joinWaitlist), `src/hooks/useRecurringBookings.ts:59,84,109` |
| **What**           | After every mutation, a full refetch is triggered. Rapid clicks (e.g., double-click on "Cancel") can fire multiple concurrent delete + fetch cycles. No debounce, no request deduplication.     |
| **Why it matters** | Doubles server load unnecessarily and can cause race conditions where an older response overwrites a newer one in state.                                                                        |

**Remediation:**

TanStack Query deduplicates requests with the same query key automatically. For buttons, add disabled state during mutation:

```tsx
<Button onClick={() => handleUnbook(booking.id)} disabled={isDeletingId === booking.id}>
  {isDeletingId === booking.id ? <Loader2 className="animate-spin" /> : 'Cancel'}
</Button>
```

---

### F13 — No Circuit Breaker or Service Health Detection

|                    |                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                   |
| **Importance**     | 5/10                                                                                                                                                                                                                         |
| **Evidence**       | No files in `src/` implement any form of circuit breaker, failure counter, or service health check.                                                                                                                          |
| **What**           | If Supabase goes down, every user action triggers a failed request, an error toast, and a console.error. There is no mechanism to detect "Supabase is down" and temporarily stop making requests.                            |
| **Why it matters** | During an outage, the app floods Supabase with requests (every hook remounts, every user clicks retry), error toasts stack up (limited to 1 by `TOAST_LIMIT` in `use-toast.ts:5`), and the user experience degrades rapidly. |

**Remediation (lightweight circuit breaker):**

```ts
// src/lib/circuitBreaker.ts
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private readonly threshold = 5;
  private readonly resetTimeout = 30_000;

  get isOpen(): boolean {
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.failures = 0; // half-open: allow one attempt
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.failures = 0;
  }

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
  }
}

export const supabaseCircuit = new CircuitBreaker();
```

---

## Resilience Assessment

| Category                 | Rating (1-10) | Details                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Timeout Handling**     | **1**         | Zero timeouts anywhere. Supabase client has no `fetch` timeout override. Auth session check can hang forever. No `AbortController` usage.                                                                                                                                                                                                                                                                                 |
| **Retry Logic**          | **1**         | Zero retry logic. Every failed request is terminal. No exponential backoff. TanStack Query retry defaults are unused because no hook calls `useQuery`.                                                                                                                                                                                                                                                                    |
| **Circuit Breaker**      | **1**         | No circuit breaker, no failure counting, no service health detection, no request throttling during outages.                                                                                                                                                                                                                                                                                                               |
| **Bulkhead**             | **2**         | Partial: `Promise.all` in `useParkingSpots` and `useStatistics` groups related queries, but failure in one can cascade. No resource isolation between features. Supabase connection pool is the default (managed by the SDK).                                                                                                                                                                                             |
| **Graceful Degradation** | **4**         | Best category due to: (1) mock Supabase client when env vars missing (`client.ts:20-28`), (2) hardcoded fallback spots in `useParkingSpots` (lines 16-19, 41-44), (3) `ErrorBoundary` for render crashes, (4) `isSupabaseConfigured` guards in every hook, (5) Statistics fairness score client-side fallback calculation (`Statistics.tsx:578-593`). However, no offline support, no cached responses, no feature flags. |
| **Overall**              | **2**         | The application has no resilience infrastructure. A single slow or failed Supabase request results in an infinite spinner or an error toast with no recovery path. The only mitigation is the browser's "reload page" button.                                                                                                                                                                                             |

---

## Top 5 Prioritized Improvements

### 1. Migrate all hooks to TanStack Query (addresses F1, F3, F6, F9, F11, F12)

**Impact:** Highest. One refactoring effort solves 6 findings.
**Effort:** Medium (6 hooks + 2 page-level fetch functions).
**What:** Replace manual `useState`/`useEffect` data fetching with `useQuery`/`useMutation`. Configure `QueryClient` with retry, staleTime, gcTime, refetchOnWindowFocus, and refetchOnReconnect.

### 2. Add Supabase request timeouts via global fetch override (addresses F2, F10)

**Impact:** High. Prevents infinite loading states.
**Effort:** Low (5 lines in `client.ts`).
**What:** Wrap `createClient`'s `global.fetch` with an `AbortController` timeout of 15 seconds. Add timeout to auth session checks.

### 3. Replace `Promise.all` with `Promise.allSettled` in parallel fetches (addresses F4)

**Impact:** High. Prevents one flaky query from killing all data.
**Effort:** Low (2 files, minimal changes).
**What:** In `useParkingSpots.ts:26` and `useStatistics.ts:48`, switch to `Promise.allSettled` and handle individual rejections.

### 4. Add network connectivity detection and offline indicator (addresses F7)

**Impact:** Medium. Improves UX during connectivity issues.
**Effort:** Low (one hook + one UI component).
**What:** Create `useOnlineStatus` hook. Show offline banner. Suppress fetch attempts and error toasts when offline. TanStack Query's `onlineManager` can integrate directly.

### 5. Add global unhandled error/rejection handler (addresses F8)

**Impact:** Medium. Catches errors that slip through all other handlers.
**Effort:** Low (10 lines in `main.tsx`).
**What:** Register `window.addEventListener('unhandledrejection', ...)` and `window.addEventListener('error', ...)`. Log to external service (Sentry integration is already TODO'd in `ErrorBoundary.tsx:44`).

---

## Appendix: Files Audited

| File                                  | Lines | Key Observations                                      |
| ------------------------------------- | ----- | ----------------------------------------------------- |
| `src/App.tsx`                         | 58    | Unconfigured `QueryClient`, `ErrorBoundary` wraps app |
| `src/main.tsx`                        | 5     | No global error handlers registered                   |
| `src/integrations/supabase/client.ts` | 29    | No timeout, no retry config, good mock fallback       |
| `src/hooks/useAuth.tsx`               | 43    | No timeout on `getSession()`, no error on `signOut()` |
| `src/hooks/useParkingSpots.ts`        | 82    | `Promise.all`, hardcoded fallback spots               |
| `src/hooks/useStatistics.ts`          | 164   | `Promise.all` with 5 queries, partial error logging   |
| `src/hooks/useWaitlist.ts`            | 134   | No retry on join/leave                                |
| `src/hooks/useUserProfile.ts`         | 75    | No retry, no cache                                    |
| `src/hooks/useRecurringBookings.ts`   | 139   | No retry on CRUD                                      |
| `src/hooks/useBookingAudit.ts`        | 65    | No retry, no cache                                    |
| `src/hooks/use-toast.ts`              | 186   | `TOAST_LIMIT = 1` prevents toast storms               |
| `src/pages/Auth.tsx`                  | 422   | No timeout on session check, no retry on login        |
| `src/pages/Index.tsx`                 | 513   | No retry, no optimistic updates, no debounce          |
| `src/pages/Statistics.tsx`            | 1174+ | Duplicate fetch logic (page + hook), no caching       |
| `src/components/ErrorBoundary.tsx`    | 105   | Render-only, no async error capture, no reporting     |
| `src/components/ProtectedRoute.tsx`   | 25    | Infinite spinner if session check hangs               |
| `src/lib/env.ts`                      | 86    | Good validation, graceful degradation in production   |
| `package.json`                        | 128   | `@tanstack/react-query` installed but unused          |
