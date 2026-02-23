# Input Validation Security Audit

**Date:** 2026-02-23
**Scope:** All user inputs, form validation, Supabase query construction, SQL functions
**Risk Score: 3.5 / 10** (Low-Medium)

---

## Validation Matrix

| Input                | Location                                | Client Validation           | Server Validation                    | Status                               |
| -------------------- | --------------------------------------- | --------------------------- | ------------------------------------ | ------------------------------------ |
| Email (login/signup) | `Auth.tsx:53-66`                        | `endsWith('@lht.dlh.de')`   | Supabase Auth                        | **PARTIAL** — no server domain check |
| Password             | `Auth.tsx:69-75`                        | `length >= 6`               | Supabase Auth                        | **PARTIAL** — weak policy            |
| Display name         | `Auth.tsx:77-83`                        | `trim().length > 0`, no max | Supabase metadata                    | **FAIL** — no max length             |
| Booking date         | `BookingDialogWithValidation.tsx:88-92` | Not-in-past check           | DB constraint                        | **PASS**                             |
| Booking duration     | `BookingDialogWithValidation.tsx:222`   | RadioGroup (limited values) | DB enum `booking_duration`           | **PASS**                             |
| Vehicle type         | `BookingDialogWithValidation.tsx:280`   | RadioGroup (limited values) | DB enum `vehicle_type`               | **PASS**                             |
| Spot number          | `BookingDialogWithValidation.tsx`       | Hardcoded 84/85 buttons     | DB `CHECK (spot_number IN (84, 85))` | **PASS**                             |
| User name in booking | `Index.tsx:86`                          | None                        | None                                 | **FAIL** — user-controlled metadata  |
| Profile update       | `useUserProfile.ts:47`                  | TypeScript types only       | None (beyond types.ts)               | **PARTIAL**                          |
| Recurring booking    | `useRecurringBookings.ts:44`            | TypeScript types only       | DB constraints                       | **PARTIAL**                          |
| Waitlist join        | `useWaitlist.ts:51`                     | None                        | RLS + DB constraints                 | **PARTIAL**                          |
| Env variables        | `lib/env.ts`                            | Zod schema                  | N/A                                  | **PASS**                             |

---

## Findings

### F1 — Auth.tsx Bypasses Zod Validation in AuthService

|              |                                                                                                                                                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Medium                                                                                                                                                                                                          |
| **CWE**      | CWE-20 (Improper Input Validation)                                                                                                                                                                              |
| **Evidence** | `src/pages/Auth.tsx:85-179` vs `src/services/authService.ts:61-216`                                                                                                                                             |
| **What**     | Auth page calls `supabase.auth.*` directly with inline validation (basic length/endsWith checks), bypassing the Zod schemas in `AuthService` which validate email format, password complexity, and name length. |

**Remediation:** Use `AuthService` from `Auth.tsx`:

```tsx
const result = await AuthService.login(email, password);
```

---

### F2 — Display Name Has No Max-Length Validation

|              |                                                                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity** | Medium                                                                                                                                                                               |
| **CWE**      | CWE-20 (Improper Input Validation)                                                                                                                                                   |
| **Evidence** | `src/pages/Auth.tsx:77-83`                                                                                                                                                           |
| **What**     | `validateName` checks only `trim().length > 0`. The `nameSchema` in `authService.ts:18` has `.max(100)` but is never used by `Auth.tsx`. A user could submit an extremely long name. |

**Remediation:**

```tsx
const validateName = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name is required';
  if (trimmed.length > 100) return 'Name must be 100 characters or less';
  return null;
};
```

---

### F3 — `user_name` in Booking Insert is Unsanitized User Metadata

|              |                                                                  |
| ------------ | ---------------------------------------------------------------- | --- | ---------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity** | Medium                                                           |
| **CWE**      | CWE-79 (Improper Neutralization of Input — Stored XSS potential) |
| **Evidence** | `src/pages/Index.tsx:86`                                         |
| **What**     | `user_name: user.user_metadata?.user_name                        |     | user.email |     | 'Unknown'`— the`user_name` comes from user-controlled Supabase metadata. While React escapes output by default, this value is stored in the database and displayed to other users. |

**Remediation:** Sanitize before storage:

```ts
const sanitizedName = (user.user_metadata?.user_name || user.email || 'Unknown')
  .trim()
  .slice(0, 100);
```

---

### F4 — Duplicate Booking Check Uses `user_name` Not `user_id`

|              |                                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| **Severity** | Medium                                                                            |
| **CWE**      | CWE-639 (Authorization Bypass Through User-Controlled Key)                        |
| **Evidence** | `src/components/BookingDialogWithValidation.tsx:74`                               |
| **What**     | `.eq('user_name', userName)` — if display names collide, wrong users are matched. |

**Remediation:**

```ts
.eq('user_id', userId)
```

---

### F5 — Type Assertions Without Runtime Validation

|                    |                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| **Severity**       | Low                                                                                                                                                              |
| **CWE**            | CWE-20                                                                                                                                                           |
| **Evidence**       | `src/pages/Index.tsx:53-61`, `src/components/BookingDialogWithValidation.tsx:222,280`                                                                            |
| **What**           | `as 'morning'                                                                                                                                                    | 'afternoon' | 'full'`and`as 'car' | 'motorcycle'` type assertions on database responses and RadioGroup values without runtime Zod validation. |
| **Why it matters** | If DB data is corrupted or RadioGroup behavior changes, these assertions hide the error. The `bookingService.ts` correctly validates with Zod but it's not used. |

**Remediation:** Use Zod `.parse()` on DB responses, or use the existing `isDuration`/`isVehicleType` guards.

---

### F6 — Profile/Recurring/Waitlist Hooks Lack Client Validation

|                    |                                                                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | Low                                                                                                                                                                      |
| **CWE**            | CWE-20                                                                                                                                                                   |
| **Evidence**       | `src/hooks/useUserProfile.ts:47`, `src/hooks/useRecurringBookings.ts:44`, `src/hooks/useWaitlist.ts:51`                                                                  |
| **What**           | V2 hooks pass data directly to Supabase without client-side Zod validation. They rely entirely on TypeScript types (compile-time only) and DB constraints (server-side). |
| **Why it matters** | Defense-in-depth: client-side validation catches errors earlier with better UX. DB constraints alone give cryptic PostgreSQL errors.                                     |

**Remediation:** Add Zod schemas for each V2 feature input.

---

## Positive Findings

- **No SQL injection vectors**: All Supabase queries use parameterized PostgREST API (`.eq()`, `.gte()`, etc.)
- **No `.rpc()` calls with user input**: No raw SQL injection risk
- **No `dangerouslySetInnerHTML` on user data**: Only in shadcn/ui `chart.tsx:70` (no user input flows there)
- **No `eval()`, `innerHTML`, file system operations, or URL parameter handling**
- **Strong DB constraints**: Enum types, CHECK constraints, BEFORE INSERT triggers for conflict validation
- **RLS enforces `auth.uid() = user_id`** on all write operations
- **Zod validation exists in services** — just not used consistently
- **`security_invoker = true`** on all views
- **SECURITY DEFINER functions set `search_path`** to prevent injection

---

## Pass/Fail Checklist

| Check                     | Status      | Notes                                                                |
| ------------------------- | ----------- | -------------------------------------------------------------------- |
| SQL Injection             | **PASS**    | PostgREST parameterized queries; no raw SQL                          |
| NoSQL Injection           | **N/A**     | PostgreSQL, not MongoDB                                              |
| Command Injection         | **N/A**     | No child process spawning                                            |
| XSS Prevention            | **PASS**    | React escapes by default; no `dangerouslySetInnerHTML` on user input |
| XXE                       | **N/A**     | No XML parsing                                                       |
| Path Traversal            | **N/A**     | No file system operations                                            |
| Body size limits          | **N/A**     | Supabase handles request limits                                      |
| Parameter pollution       | **N/A**     | No URL query parameter handling                                      |
| Type checking (Zod)       | **PARTIAL** | Services use Zod; pages/hooks bypass it                              |
| Required field validation | **PARTIAL** | Forms validate required fields; hooks don't                          |
| Email domain validation   | **FAIL**    | Client-side only                                                     |
| Display name max length   | **FAIL**    | No max length in Auth.tsx                                            |

---

## Top 5 Prioritized Fixes

| Priority | Fix                                                                 | Severity | Effort |
| -------- | ------------------------------------------------------------------- | -------- | ------ |
| **1**    | Wire `Auth.tsx` to use `AuthService` (gets Zod validation for free) | Medium   | Low    |
| **2**    | Use `user_id` instead of `user_name` for duplicate booking check    | Medium   | Low    |
| **3**    | Add max-length validation to display name input                     | Medium   | Low    |
| **4**    | Sanitize `user_name` before inserting into bookings                 | Medium   | Low    |
| **5**    | Add Zod schemas to V2 hooks (profile, recurring, waitlist)          | Low      | Medium |
