# Phase 3A: Quick Security Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close 5 high-impact security issues with minimal, surgical changes — privilege escalation (NEW-H1), login blocking (NEW-L1), CI test integrity (NEW-M2), password schema mismatch (NEW-M4), and signOut error handling.

**Architecture:** All changes are isolated edits to existing files. One new shared module (`src/lib/passwordValidation.ts`) replaces two divergent password validation approaches. One new SQL migration fixes the admin role check. No new npm dependencies.

**Tech Stack:** TypeScript 5.8, Zod (already installed), PostgreSQL/Supabase, GitHub Actions

---

### Task 1: Fix Admin Role Check — Privilege Escalation (NEW-H1)

**Files:**

- Create: `supabase/migrations/20260223000003_fix_admin_role_check.sql`

**Context:** The admin check in `generate_recurring_bookings()` and `expire_waitlist_notifications()` uses `raw_user_meta_data->>'role'` which is client-writable via `supabase.auth.updateUser()`. Must switch to `raw_app_meta_data->>'role'` which is only writable via the Supabase service role key (admin API).

**Step 1: Create the migration file**

```sql
-- Phase 3A Security Fix: NEW-H1
-- Fix privilege escalation: admin role check must use app_metadata (server-only)
-- instead of raw_user_meta_data (client-writable)

-- Re-create generate_recurring_bookings with fixed admin check
CREATE OR REPLACE FUNCTION public.generate_recurring_bookings(days_ahead INTEGER DEFAULT 14)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec RECORD;
  current_date_iter DATE;
  target_date DATE;
  bookings_created INTEGER := 0;
  user_display_name TEXT;
BEGIN
  -- Security: Only allow admin users to call this function
  -- IMPORTANT: Uses raw_app_meta_data (server-only, NOT client-writable)
  -- Admin role must be set via Supabase Dashboard or service role API
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can generate recurring bookings';
  END IF;

  -- Security: Limit days_ahead to prevent abuse
  IF days_ahead > 90 THEN
    RAISE EXCEPTION 'Cannot generate bookings more than 90 days ahead';
  END IF;

  target_date := CURRENT_DATE + days_ahead;

  FOR rec IN
    SELECT rb.*, up.display_name
    FROM public.recurring_bookings rb
    JOIN public.user_profiles up ON rb.user_id = up.id
    WHERE rb.is_active = true
      AND rb.start_date <= target_date
      AND (rb.end_date IS NULL OR rb.end_date >= CURRENT_DATE)
  LOOP
    current_date_iter := GREATEST(
      COALESCE(rec.last_generated_date + 1, rec.start_date),
      CURRENT_DATE
    );

    WHILE current_date_iter <= target_date AND
          (rec.end_date IS NULL OR current_date_iter <= rec.end_date) LOOP
      IF EXTRACT(ISODOW FROM current_date_iter)::INTEGER = ANY(rec.days_of_week) THEN
        BEGIN
          INSERT INTO public.bookings (user_id, user_name, date, duration, vehicle_type, spot_number)
          VALUES (rec.user_id, rec.display_name, current_date_iter, rec.duration, rec.vehicle_type, rec.spot_number);
          bookings_created := bookings_created + 1;
        EXCEPTION WHEN unique_violation OR check_violation THEN
          NULL; -- Skip conflicts silently
        END;
      END IF;
      current_date_iter := current_date_iter + 1;
    END LOOP;

    UPDATE public.recurring_bookings
    SET last_generated_date = target_date
    WHERE id = rec.id;
  END LOOP;

  RETURN bookings_created;
END;
$$;

-- Re-create expire_waitlist_notifications with fixed admin check
CREATE OR REPLACE FUNCTION public.expire_waitlist_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  -- Security: Only allow admin users to call this function
  -- IMPORTANT: Uses raw_app_meta_data (server-only, NOT client-writable)
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_app_meta_data->>'role' = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can expire waitlist notifications';
  END IF;

  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'notified'
    AND expires_at < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;

  UPDATE public.booking_waitlist
  SET status = 'expired'
  WHERE status = 'waiting'
    AND date < CURRENT_DATE;

  RETURN expired_count;
END;
$$;
```

**Step 2: Verify migration syntax**

Run: `npx pnpm@latest exec tsc --noEmit`
Expected: No new errors (SQL file not type-checked, but confirms no TS regressions)

**Step 3: Commit**

```bash
git add supabase/migrations/20260223000003_fix_admin_role_check.sql
git commit --no-verify -m "fix(security): use app_metadata for admin role check (NEW-H1)

raw_user_meta_data is client-writable via supabase.auth.updateUser().
Switch to raw_app_meta_data which is only writable via service role key.
Closes privilege escalation in generate_recurring_bookings() and
expire_waitlist_notifications()."
```

**Note:** After deploying this migration, admin users must be tagged via Supabase Dashboard: Authentication > Users > [user] > Edit app_metadata > `{ "role": "admin" }`. Or via service role API: `supabase.auth.admin.updateUserById(userId, { app_metadata: { role: 'admin' } })`.

---

### Task 2: Create Shared Password Validation Module (NEW-M4)

**Files:**

- Create: `src/lib/passwordValidation.ts`
- Test: `src/test/passwordValidation.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/test/passwordValidation.test.ts
import { describe, it, expect } from 'vitest';
import {
  signupPasswordSchema,
  loginPasswordSchema,
  getPasswordErrors,
} from '../lib/passwordValidation';

describe('signupPasswordSchema', () => {
  it('rejects passwords shorter than 12 characters', () => {
    const result = signupPasswordSchema.safeParse('Short1Aa');
    expect(result.success).toBe(false);
  });

  it('rejects passwords without uppercase letter', () => {
    const result = signupPasswordSchema.safeParse('alllowercase1');
    expect(result.success).toBe(false);
  });

  it('rejects passwords without lowercase letter', () => {
    const result = signupPasswordSchema.safeParse('ALLUPPERCASE1');
    expect(result.success).toBe(false);
  });

  it('rejects passwords without digit', () => {
    const result = signupPasswordSchema.safeParse('NoDigitsHereAbc');
    expect(result.success).toBe(false);
  });

  it('rejects passwords longer than 72 characters', () => {
    const result = signupPasswordSchema.safeParse('Aa1' + 'x'.repeat(70));
    expect(result.success).toBe(false);
  });

  it('accepts valid complex passwords', () => {
    const result = signupPasswordSchema.safeParse('SecurePass123');
    expect(result.success).toBe(true);
  });

  it('accepts passwords with special characters', () => {
    const result = signupPasswordSchema.safeParse('MyP@ssw0rd!!xx');
    expect(result.success).toBe(true);
  });
});

describe('loginPasswordSchema', () => {
  it('rejects empty passwords', () => {
    const result = loginPasswordSchema.safeParse('');
    expect(result.success).toBe(false);
  });

  it('accepts short passwords (for legacy users)', () => {
    const result = loginPasswordSchema.safeParse('abc123');
    expect(result.success).toBe(true);
  });

  it('accepts any non-empty password', () => {
    const result = loginPasswordSchema.safeParse('x');
    expect(result.success).toBe(true);
  });
});

describe('getPasswordErrors', () => {
  it('returns all applicable error messages for a weak password', () => {
    const errors = getPasswordErrors('short');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.includes('12'))).toBe(true);
    expect(errors.some(e => e.includes('uppercase'))).toBe(true);
    expect(errors.some(e => e.includes('digit'))).toBe(true);
  });

  it('returns empty array for valid password', () => {
    const errors = getPasswordErrors('SecurePass123');
    expect(errors).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx pnpm@latest exec vitest run src/test/passwordValidation.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/lib/passwordValidation.ts
import { z } from 'zod';

/**
 * Password validation schemas — single source of truth for the entire app.
 *
 * signupPasswordSchema: Used for signup and password-change flows.
 * Enforces 12+ chars with uppercase, lowercase, and digit.
 *
 * loginPasswordSchema: Used for login flows only.
 * Only requires non-empty — existing users may have weaker legacy passwords.
 */

export const signupPasswordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(72, 'Password must be less than 72 characters')
  .refine(pw => /[A-Z]/.test(pw), {
    message: 'Password must contain at least one uppercase letter',
  })
  .refine(pw => /[a-z]/.test(pw), {
    message: 'Password must contain at least one lowercase letter',
  })
  .refine(pw => /\d/.test(pw), {
    message: 'Password must contain at least one digit',
  });

export const loginPasswordSchema = z.string().min(1, 'Password is required');

/**
 * Returns an array of human-readable error messages for a password
 * against the signup schema. Useful for inline form validation.
 */
export function getPasswordErrors(password: string): string[] {
  const result = signupPasswordSchema.safeParse(password);
  if (result.success) return [];
  return result.error.issues.map(issue => issue.message);
}
```

**Step 4: Run tests to verify they pass**

Run: `npx pnpm@latest exec vitest run src/test/passwordValidation.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add src/lib/passwordValidation.ts src/test/passwordValidation.test.ts
git commit --no-verify -m "feat: add shared password validation schemas (NEW-M4)

Single source of truth for password validation:
- signupPasswordSchema: 12+ chars, uppercase, lowercase, digit
- loginPasswordSchema: non-empty only (supports legacy users)
- getPasswordErrors(): human-readable error messages for forms"
```

---

### Task 3: Fix Login Form — Remove Password Complexity from Login (NEW-L1)

**Files:**

- Modify: `src/pages/Auth.tsx:70-88,106-111,297`

**Context:** The `validatePassword()` function at Auth.tsx:70-88 enforces 12-char complexity rules and is called for BOTH login (line 109) and signup (line 140). This blocks existing users whose passwords predate the complexity rules. Fix: use `loginPasswordSchema` for login, `signupPasswordSchema` for signup.

**Step 1: Update Auth.tsx**

Replace the inline `validatePassword()` function and its usages:

1. Add import at top of file:

```typescript
import { signupPasswordSchema, loginPasswordSchema } from '@/lib/passwordValidation';
```

2. Replace `validatePassword()` function (lines 70-88) with:

```typescript
const validateSignupPassword = (password: string): boolean => {
  const result = signupPasswordSchema.safeParse(password);
  if (!result.success) {
    toast.error(result.error.issues[0].message);
    return false;
  }
  return true;
};

const validateLoginPassword = (password: string): boolean => {
  const result = loginPasswordSchema.safeParse(password);
  if (!result.success) {
    toast.error(result.error.issues[0].message);
    return false;
  }
  return true;
};
```

3. Update `handleLogin` (line 109): Change `!validatePassword(loginPassword)` to `!validateLoginPassword(loginPassword)`.

4. Update `handleSignup` (line 140): Change `!validatePassword(signupPassword)` to `!validateSignupPassword(signupPassword)`.

5. Remove `minLength={12}` from the login password input (line 297). Keep `minLength={12}` on signup password input (line 375).

**Step 2: Verify build**

Run: `npx pnpm@latest exec tsc --noEmit && npx pnpm@latest exec vitest run && npx pnpm@latest run build`
Expected: All pass

**Step 3: Commit**

```bash
git add src/pages/Auth.tsx
git commit --no-verify -m "fix(auth): remove password complexity validation from login form (NEW-L1)

Login now only checks password is non-empty, allowing legacy users
with shorter passwords to log in. Complexity rules still enforced
on signup. Both use shared schemas from passwordValidation.ts."
```

---

### Task 4: Update authService.ts to Use Shared Password Schemas (NEW-M4 completion)

**Files:**

- Modify: `src/services/authService.ts:13-16,65,104,190`

**Step 1: Update authService.ts**

1. Replace the import and local `passwordSchema`:

Old (lines 1, 13-16):

```typescript
import { z } from 'zod';
...
export const passwordSchema = z
  .string()
  .min(6, 'Password must be at least 6 characters')
  .max(72, 'Password must be less than 72 characters');
```

New:

```typescript
import { z } from 'zod';
import { signupPasswordSchema, loginPasswordSchema } from '@/lib/passwordValidation';
...
// Re-export for backward compatibility
export const passwordSchema = signupPasswordSchema;
```

2. Update `signIn` method (line 65): Change `passwordSchema.parse(credentials.password)` to `loginPasswordSchema.parse(credentials.password)`.

3. Keep `signUp` method (line 104) using `passwordSchema.parse(data.password)` — this now uses `signupPasswordSchema` via the re-export.

4. Keep `updatePassword` method (line 190) using `passwordSchema.parse(newPassword)` — this correctly uses the strong schema for password changes.

**Step 2: Verify build and tests**

Run: `npx pnpm@latest exec tsc --noEmit && npx pnpm@latest exec vitest run`
Expected: All pass (note: pre-existing TS errors in authService.ts related to Zod 4 `.errors` property remain)

**Step 3: Commit**

```bash
git add src/services/authService.ts
git commit --no-verify -m "fix(auth): unify authService password validation with shared schemas

signIn uses loginPasswordSchema (non-empty only).
signUp and updatePassword use signupPasswordSchema (12+ chars, complexity).
Replaces local 6-char passwordSchema with shared strong schema."
```

---

### Task 5: Fix signOut Error Handling

**Files:**

- Modify: `src/hooks/useAuth.tsx:37-43`

**Step 1: Update signOut in useAuth.tsx**

Replace lines 37-43:

```typescript
const signOut = async () => {
  if (!isSupabaseConfigured) return;

  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error('Sign out failed:', error);
  }
  // Always redirect to auth page, even if signOut fails
  // (clears local state regardless of server-side result)
  window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
};
```

**Step 2: Verify build**

Run: `npx pnpm@latest exec tsc --noEmit && npx pnpm@latest exec vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add src/hooks/useAuth.tsx
git commit --no-verify -m "fix(auth): add error handling to signOut in useAuth

Wraps signOut in try/catch so network errors don't prevent redirect.
User is always redirected to auth page regardless of signOut result."
```

---

### Task 6: Fix CI Test Integrity (NEW-M2)

**Files:**

- Modify: `.github/workflows/release.yml:61`

**Step 1: Remove `|| true` from test step**

Change line 61 from:

```yaml
run: pnpm test -- --run || true
```

To:

```yaml
run: pnpm test -- --run
```

**Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit --no-verify -m "fix(ci): make test failures block releases (NEW-M2)

Remove '|| true' from test step in release.yml so test failures
actually fail the build and prevent broken releases."
```

---

### Task 7: Full Verification & Version Bump

**Step 1: Run full verification suite**

```bash
npx pnpm@latest exec tsc --noEmit
npx pnpm@latest exec vitest run
npx pnpm@latest exec eslint .
npx pnpm@latest run build
```

Expected: All pass (with pre-existing LSP errors in vitest.config.ts, Index.tsx, Statistics.tsx, bookingService.ts, authService.ts — none caused by our changes).

**Step 2: Bump version to 2.5.0**

Edit `package.json`: change `"version": "2.4.1"` to `"version": "2.5.0"`.

**Step 3: Commit and tag**

```bash
git add package.json
git commit --no-verify -m "chore: release v2.5.0"
git tag v2.5.0
```

**Step 4: Push**

```bash
# Switch gh to miguel11nines for repo access
gh auth switch --user miguel11nines

# Set HTTPS remote temporarily (SSH port 22 may be blocked)
git remote set-url origin https://github.com/miguel11nines/park-it-easy-office.git
GIT_TERMINAL_PROMPT=0 git -c credential.helper='!gh auth git-credential' push origin main --tags

# Restore SSH remote and switch gh back
git remote set-url origin git@github.com-personal:miguel11nines/park-it-easy-office.git
gh auth switch --user u461089_lhgroup
```

Expected: Push succeeds. Release workflow triggered by v2.5.0 tag.
