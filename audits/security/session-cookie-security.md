# Session and Cookie Security Audit

**Date:** 2026-02-23
**Auditor:** Security Audit (automated)
**Scope:** Auth flow, Supabase client config, session/token management, cookie usage
**Application:** park-it-easy-office v2.3.3
**Architecture:** Vite/React 18 SPA + Supabase Auth (client-side) + GitHub Pages hosting
**Risk Score: 6.0 / 10**

> **Architecture Note:** This application is a fully client-side SPA. There is no server-side session
> management, no Express/Node.js backend setting cookies, and no server-controlled HTTP headers.
> Session state is entirely managed by the Supabase JS client (`@supabase/supabase-js`), which by
> default stores JWT access and refresh tokens in `localStorage`. Many traditional server-side
> session/cookie audit items are therefore N/A, but equivalent client-side concerns are assessed.

---

## Findings

### F1 — JWT Tokens Stored in localStorage (XSS-Extractable)

|                    |                                                                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                  |
| **CWE**            | CWE-922 (Insecure Storage of Sensitive Information)                                                                                                                                                                                                                       |
| **Evidence**       | `src/integrations/supabase/client.ts:13-18` — `createClient` called with default `persistSession: true` and no `storage` override                                                                                                                                         |
| **What**           | Supabase JS client stores `access_token` (JWT) and `refresh_token` in `localStorage` under the key `sb-<project-ref>-auth-token`. No custom `storage` adapter is configured.                                                                                              |
| **Why it matters** | `localStorage` is accessible to any JavaScript running on the same origin. A single XSS vulnerability (including from a third-party dependency) would allow an attacker to exfiltrate both the access and refresh tokens, gaining persistent impersonation of the victim. |

**Exploitability:** Medium-High. Requires an XSS vector on the same origin. The application has no CSP meta tag in `index.html:1-65` and includes an inline `<script>` block (`index.html:7-30`), which means any future CSP would need `'unsafe-inline'`, weakening XSS protection. Third-party dependencies (React, Radix, Tanstack Query, Sonner, etc.) expand the attack surface.

**Remediation:**

Option A — Use a custom `sessionStorage` adapter (limits exposure to the current tab):

```typescript
// src/integrations/supabase/client.ts
export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: sessionStorage, // Tokens cleared when tab closes
  },
});
```

Option B — Use a custom encrypted storage adapter (defense-in-depth):

```typescript
// src/lib/secureStorage.ts
import { encrypt, decrypt } from './crypto'; // app-level AES-GCM wrapper

export const secureStorage = {
  getItem: (key: string) => {
    const raw = localStorage.getItem(key);
    return raw ? decrypt(raw) : null;
  },
  setItem: (key: string, value: string) => {
    localStorage.setItem(key, encrypt(value));
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
  },
};
```

> **Note:** Neither option fully prevents XSS-based theft (the attacker's JS can call the Supabase
> client directly). The real mitigation is preventing XSS — see F6 (CSP).

---

### F2 — No AuthContext Provider — Independent Subscriptions Per Consumer

|                    |                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                             |
| **CWE**            | CWE-613 (Insufficient Session Expiration) — by analogy: stale session state                                                                                                                                                                                                                                                                                                            |
| **Evidence**       | `src/hooks/useAuth.tsx:5-42` — each `useAuth()` call creates a new `onAuthStateChange` subscription; `src/components/ProtectedRoute.tsx:10`, `src/pages/Auth.tsx:41`, `src/pages/Index.tsx:26`, `src/pages/Statistics.tsx:41` — four+ independent instances                                                                                                                            |
| **What**           | `useAuth` is a plain hook (not backed by React Context). Every component that calls `useAuth()` spins up its own `supabase.auth.getSession()` call and its own `onAuthStateChange` listener. There is no single source of truth for auth state.                                                                                                                                        |
| **Why it matters** | After `signOut()` fires in one component, other mounted components may briefly retain stale `user` objects. During that window, Supabase API calls from those components could succeed with a cached token. The `ProtectedRoute` guard may not immediately redirect. This is a race condition, not a guaranteed exploit, but it violates the principle of single-source session truth. |

**Exploitability:** Low. Requires exploiting the timing window between signOut and subscription propagation. Supabase's client internally invalidates the token, so API calls should fail server-side. The main risk is UI-level inconsistency (e.g., user sees protected content briefly after logout).

**Remediation:**

```tsx
// src/contexts/AuthContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // Use React Router navigate instead of hardcoded URL
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
```

---

### F3 — Hardcoded Production URL in signOut Redirect

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-601 (URL Redirection to Untrusted Site) — tangentially; CWE-1188 (Insecure Default Initialization)                                                                                                                                                                                                                                                                                                                                             |
| **Evidence**       | `src/hooks/useAuth.tsx:39` — `window.location.href = 'https://miguel11nines.github.io/park-it-easy-office/auth'`                                                                                                                                                                                                                                                                                                                                   |
| **What**           | The `signOut` function does a hard navigation to a hardcoded GitHub Pages URL after calling `supabase.auth.signOut()`. This bypasses React Router, ignores `BASE_URL` / env configuration, and breaks on any non-production domain (localhost, staging, forks).                                                                                                                                                                                    |
| **Why it matters** | (1) Using `window.location.href` instead of React Router's `navigate()` causes a full page reload, which re-initializes all state — not a security issue per se, but it disrupts orderly session teardown. (2) The hardcoded URL means a developer running locally is redirected to production after logout, potentially leaking intent. (3) If the GitHub Pages URL is ever taken over or the repo is transferred, this becomes an open redirect. |

**Exploitability:** Low direct exploitability. The URL is hardcoded (not user-controlled), so it's not a classic open redirect. But it represents brittle configuration.

**Remediation:**

```typescript
const signOut = async () => {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
  // Use relative navigation via React Router
  window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
};
```

Or better, with React Router context:

```typescript
navigate('/auth', { replace: true });
```

---

### F4 — PASSWORD_RECOVERY Event Not Handled

|                    |                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-640 (Weak Password Recovery Mechanism)                                                                                                                                                                                                                                                                                                         |
| **Evidence**       | `src/hooks/useAuth.tsx:26` — `onAuthStateChange` callback ignores `_event` parameter; `src/pages/Auth.tsx:41` — same pattern; `src/services/authService.ts:187-216` — `updatePassword()` exists but is never called from any UI flow                                                                                                               |
| **What**           | When a user clicks a password reset link, Supabase redirects back to the app with a `PASSWORD_RECOVERY` auth event. No component listens for this event to prompt the user to enter a new password. The `AuthService.updatePassword()` method exists in dead code (`authService.ts:187`) but is unreachable from the UI.                           |
| **Why it matters** | Users who attempt password reset will be redirected to the app but never prompted to set a new password. The reset token in the URL is consumed by `detectSessionInUrl: true` (`client.ts:17`), creating a session, but the user has no way to actually change their password. The old password remains valid. This is a broken security workflow. |

**Exploitability:** Not an exploit vector per se, but it means password reset is non-functional, which blocks account recovery and means compromised passwords cannot be rotated through the app.

**Remediation:**

```tsx
// In the Auth.tsx onAuthStateChange handler or a centralized AuthContext:
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    // Show password update dialog/page
    navigate('/reset-password');
    // or set state to show an inline password form
  }
  if (session) {
    navigate('/');
  }
});

// Create a /reset-password page that calls:
const { error } = await supabase.auth.updateUser({ password: newPassword });
```

---

### F5 — No Session Timeout / Idle Timeout Configuration

|                    |                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                      |
| **CWE**            | CWE-613 (Insufficient Session Expiration)                                                                                                                                                                                                                                                                                                                       |
| **Evidence**       | `src/integrations/supabase/client.ts:13-18` — no `auth.flowType`, no custom token lifetimes; Supabase project-level JWT expiry defaults (3600s access token, long-lived refresh token)                                                                                                                                                                          |
| **What**           | The Supabase client is configured with `autoRefreshToken: true` which silently refreshes the access token before it expires. There is no client-side idle timeout, no maximum session duration, and no mechanism to force re-authentication after a period of inactivity. Refresh tokens are long-lived (Supabase default: no expiry until explicitly revoked). |
| **Why it matters** | If a user walks away from an unlocked machine, the session persists indefinitely. With `localStorage` persistence, the session survives browser restarts. Combined with F1, a stolen refresh token provides long-term account access.                                                                                                                           |

**Exploitability:** Medium. Physical access to an unlocked machine, or token theft via XSS, yields indefinite session access.

**Remediation:**

1. **Server-side (Supabase Dashboard):** Reduce JWT expiry (e.g., 900s) and set refresh token rotation + reuse detection.

2. **Client-side idle timeout:**

```typescript
// src/lib/idleTimeout.ts
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
let idleTimer: ReturnType<typeof setTimeout>;

const resetTimer = () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    await supabase.auth.signOut();
    window.location.href = `${window.location.origin}${import.meta.env.BASE_URL}auth`;
  }, IDLE_TIMEOUT_MS);
};

['mousedown', 'keydown', 'scroll', 'touchstart'].forEach(event =>
  document.addEventListener(event, resetTimer, { passive: true })
);
resetTimer();
```

---

### F6 — No Content Security Policy (CSP)

|                    |                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                          |
| **CWE**            | CWE-1021 (Improper Restriction of Rendered UI Layers); CWE-79 (XSS — lack of defense-in-depth)                                                                                                                                                                                                                                                    |
| **Evidence**       | `index.html:1-65` — no `<meta http-equiv="Content-Security-Policy">` tag; `.github/workflows/deploy.yml:1-63` — no custom headers configuration; GitHub Pages does not support custom HTTP response headers                                                                                                                                       |
| **What**           | There is no Content Security Policy configured via either HTTP headers or `<meta>` tag. The inline script at `index.html:7-30` (SPA GitHub Pages routing hack) would require `'unsafe-inline'` in any CSP, but currently there is no CSP at all. GitHub Pages does not allow setting custom HTTP headers, so the `<meta>` tag is the only option. |
| **Why it matters** | CSP is the primary defense-in-depth against XSS. Without it, any injected script runs unrestricted — and since tokens are in `localStorage` (F1), XSS immediately leads to session hijack.                                                                                                                                                        |

**Exploitability:** High (amplifies any XSS vector). This is not a vulnerability by itself but removes the most important mitigation for the highest-impact vulnerability class.

**Remediation:**

```html
<!-- index.html, inside <head> before any scripts -->
<meta
  http-equiv="Content-Security-Policy"
  content="
    default-src 'self';
    script-src 'self' 'unsafe-inline';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co;
    frame-ancestors 'none';
    base-uri 'self';
    form-action 'self';
  "
/>
```

> `'unsafe-inline'` for scripts is required by the SPA routing script. Consider moving that logic
> into the bundled app code and using a nonce-based CSP for stronger protection.

---

### F7 — Sidebar Cookie Set Without Secure or SameSite Flags

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-614 (Sensitive Cookie Without 'Secure' Flag); CWE-1275 (Sensitive Cookie with Improper SameSite Attribute)                                                                                                                                                                                                                                                                                                                                                                                  |
| **Evidence**       | `src/components/ui/sidebar.tsx:15-16` — `SIDEBAR_COOKIE_NAME = "sidebar:state"`, `SIDEBAR_COOKIE_MAX_AGE = 604800`; `src/components/ui/sidebar.tsx:68` — `document.cookie = \`${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}\``                                                                                                                                                                                                                                 |
| **What**           | The sidebar component sets a cookie `sidebar:state` with value `true`/`false` and 7-day expiry. The cookie is set without `Secure`, `SameSite`, or `HttpOnly` flags.                                                                                                                                                                                                                                                                                                                            |
| **Why it matters** | This cookie contains only UI preference data (not sensitive), so the risk is low. However: (1) Without `Secure`, the cookie is sent over HTTP if the user ever visits the non-HTTPS version. (2) Without `SameSite`, the browser defaults vary (Chrome defaults to `Lax`, but older browsers may default to `None`). (3) The cookie is readable by JavaScript, which is acceptable since the JS code itself sets it, but it represents a pattern that should not be extended to sensitive data. |

**Exploitability:** Negligible. The cookie contains no sensitive data.

**Remediation:**

```typescript
document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}; Secure; SameSite=Lax`;
```

---

### F8 — Weak Password Policy (Minimum 6 Characters, No Complexity)

|                    |                                                                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                             |
| **CWE**            | CWE-521 (Weak Password Requirements)                                                                                                                                                                                                |
| **Evidence**       | `src/pages/Auth.tsx:70` — `password.length < 6`; `src/services/authService.ts:14` — `z.string().min(6, ...)`                                                                                                                        |
| **What**           | The password minimum length is 6 characters with no complexity requirements (no uppercase, numbers, or special character requirements). The max length of 72 in `authService.ts:16` is appropriate (bcrypt limit).                  |
| **Why it matters** | A 6-character password with no complexity requirement can be brute-forced. Supabase's server-side rate limiting mitigates online attacks, but if the password hash database is ever exposed, short passwords are trivially cracked. |

**Exploitability:** Low (Supabase rate-limits login attempts). Impact is primarily in offline scenarios.

**Remediation:**

```typescript
// src/services/authService.ts
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be less than 72 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');
```

---

### F9 — No Explicit Session Revocation on Logout (Client-Side Only)

|                    |                                                                                                                                                                                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                      |
| **CWE**            | CWE-613 (Insufficient Session Expiration)                                                                                                                                                                                                                                    |
| **Evidence**       | `src/hooks/useAuth.tsx:34-40` — `signOut` calls `supabase.auth.signOut()` then hard-navigates                                                                                                                                                                                |
| **What**           | `supabase.auth.signOut()` by default calls the Supabase `/logout` endpoint with `scope: 'local'`, which only clears the local session. Other browser tabs or devices retain their sessions. The `signOut()` call does not pass `{ scope: 'global' }` to revoke all sessions. |
| **Why it matters** | If a user suspects their account is compromised and logs out, other sessions (other tabs, other devices with the same refresh token) remain active until the access token naturally expires or the refresh token is used and rotated.                                        |

**Exploitability:** Low. Requires the attacker to have already obtained a valid refresh token.

**Remediation:**

```typescript
const signOut = async () => {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut({ scope: 'global' }); // Revoke all sessions
  navigate('/auth', { replace: true });
};
```

---

### F10 — Missing HTTP Security Headers (GitHub Pages Limitation)

|                    |                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                     |
| **CWE**            | CWE-693 (Protection Mechanism Failure)                                                                                                                                                                                                                                                                                                                         |
| **Evidence**       | `.github/workflows/deploy.yml:1-63` — static deployment with no headers configuration; GitHub Pages does not support custom response headers                                                                                                                                                                                                                   |
| **What**           | The following HTTP security headers cannot be set on GitHub Pages: `Strict-Transport-Security` (HSTS), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. While GitHub Pages does serve over HTTPS by default and sets some headers, the application has no control over them.                                              |
| **Why it matters** | Without HSTS, a first-time visitor could be MITM'd on HTTP before being redirected to HTTPS. Without `X-Frame-Options`/CSP `frame-ancestors`, the app could be embedded in an iframe for clickjacking (though this is low-value for this app). The `SECURITY.md` file recommends these headers but they are not implementable on the current hosting platform. |

**Exploitability:** Low for this specific application (limited sensitive actions, corporate email domain restriction).

**Remediation:**

- Add a `<meta>` CSP tag with `frame-ancestors 'none'` equivalent via `Content-Security-Policy` (see F6).
- Consider migrating to a platform that supports custom headers (Cloudflare Pages, Vercel, Netlify) for full header control.
- As a partial mitigation, GitHub Pages does enforce HTTPS via its own HSTS (for `*.github.io`), so HSTS is partially covered.

---

## Summary Risk Score: 6.0 / 10

| Factor                    | Assessment                                                                  |
| ------------------------- | --------------------------------------------------------------------------- |
| **Token storage**         | `localStorage` with no encryption or CSP — high XSS impact                  |
| **Session lifecycle**     | No idle timeout, no global revocation by default, refresh tokens long-lived |
| **Auth state management** | No centralized context — potential for stale state                          |
| **Password recovery**     | Broken flow — `PASSWORD_RECOVERY` event unhandled                           |
| **Cookie hygiene**        | Only one cookie (non-sensitive sidebar state), missing flags                |
| **CSRF**                  | N/A — Supabase uses Bearer tokens, not cookies, for API auth                |
| **Hosting constraints**   | GitHub Pages prevents custom HTTP headers                                   |

The score of 6.0 reflects that while there are no immediately exploitable critical vulnerabilities (Supabase handles the hard parts of auth), the architecture has meaningful gaps that would amplify the impact of any XSS vulnerability and provides no defense-in-depth.

---

## Top 5 Prioritized Fixes

| Priority | Fix                                                                                                     | Effort             | Impact                                                 |
| -------- | ------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------ |
| **1**    | **Add CSP `<meta>` tag** to `index.html` (F6)                                                           | Low (5 min)        | High — primary XSS mitigation                          |
| **2**    | **Handle `PASSWORD_RECOVERY` event** (F4) — wire up `authService.updatePassword()` to an actual UI flow | Medium (1-2 hours) | High — unblocks password rotation                      |
| **3**    | **Create `AuthContext` provider** (F2) — single subscription, single source of truth for auth state     | Medium (1-2 hours) | Medium — eliminates stale state bugs                   |
| **4**    | **Add client-side idle timeout** (F5) — sign out after 30 min of inactivity                             | Low (30 min)       | Medium — limits physical-access risk                   |
| **5**    | **Fix hardcoded signOut URL** (F3) — use `window.location.origin + BASE_URL` or React Router            | Low (5 min)        | Low — but prevents breakage in all non-production envs |

---

## Checklist (Pass / Fail / N/A)

| #       | Item                                | Status   | Notes                                                                                                                                                                                                                                                                                        |
| ------- | ----------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1.1** | Secure flag (HTTPS only)            | **N/A**  | No server-side session cookies. Supabase tokens are in `localStorage`, not cookies. GitHub Pages enforces HTTPS for `*.github.io`. The one sidebar cookie (`sidebar:state`) is missing `Secure` flag (F7) but contains no sensitive data.                                                    |
| **1.2** | HttpOnly flag                       | **N/A**  | No server-side cookies. `localStorage` is inherently not HttpOnly — JavaScript must access it. This is an architectural limitation of client-side SPAs with Supabase Auth. The Supabase API itself uses JWTs in `Authorization` headers, not cookies.                                        |
| **1.3** | SameSite attribute                  | **N/A**  | No auth cookies. The sidebar cookie (F7) omits `SameSite` but stores only UI state. Supabase API calls use `Authorization: Bearer <token>` headers, which are not subject to CSRF via cookies.                                                                                               |
| **1.4** | Session timeout                     | **Fail** | No client-side idle timeout. `autoRefreshToken: true` keeps the session alive indefinitely. Supabase default JWT expiry is 3600s, but auto-refresh means the session never effectively expires while the tab is open. See F5.                                                                |
| **1.5** | Session regeneration after login    | **Pass** | Supabase Auth issues a new JWT pair (access + refresh) on each `signInWithPassword` call. The old session (if any) is replaced. This is handled server-side by Supabase and is correct.                                                                                                      |
| **2.1** | All cookies have appropriate flags  | **Fail** | Sidebar cookie at `sidebar.tsx:68` is missing `Secure` and `SameSite` flags. Non-sensitive data, but incomplete hygiene. See F7.                                                                                                                                                             |
| **2.2** | No sensitive data in cookies        | **Pass** | The only cookie set by the application is `sidebar:state` with value `true`/`false`. No tokens, user IDs, or PII are stored in cookies.                                                                                                                                                      |
| **2.3** | Proper domain/path scoping          | **Pass** | Sidebar cookie is scoped to `path=/`. No overly broad domain scoping.                                                                                                                                                                                                                        |
| **2.4** | Encryption for sensitive cookies    | **N/A**  | No sensitive cookies exist.                                                                                                                                                                                                                                                                  |
| **3.1** | CSRF token implementation           | **N/A**  | Not applicable. The app uses Supabase Auth with JWT Bearer tokens in `Authorization` headers, not cookie-based session authentication. CSRF attacks exploit automatic cookie attachment; Bearer tokens must be explicitly added by JavaScript and are not automatically sent by the browser. |
| **3.2** | Double submit cookie pattern        | **N/A**  | See 3.1 — Bearer token auth makes cookie-based CSRF patterns unnecessary.                                                                                                                                                                                                                    |
| **3.3** | Origin header validation            | **N/A**  | No server-side application code to validate origins. Supabase's API gateway handles CORS. The Supabase project should have proper CORS configuration (allowed origins), which is managed in the Supabase Dashboard, not in this codebase.                                                    |
| **4.1** | Not using default in-memory storage | **Pass** | `persistSession: true` is set (`client.ts:16`), so sessions survive page reloads. The default storage is `localStorage`, which is persistent (not in-memory). Whether this is desirable is debatable — see F1 for the XSS trade-off.                                                         |
| **4.2** | Redis/database backed sessions      | **N/A**  | No server-side session store. Supabase manages sessions server-side (PostgreSQL-backed `auth.sessions` table with refresh tokens). The client stores only the JWT tokens. This is the standard architecture for Supabase Auth and is handled correctly.                                      |
| **4.3** | Session cleanup/expiration          | **Fail** | No client-side session cleanup on idle. Refresh tokens are long-lived. `signOut()` only clears the local session (`scope: 'local'`). No mechanism to expire sessions after inactivity or enforce maximum session duration. See F5 and F9.                                                    |

---

## Appendix: Files Reviewed

| File                                                                   | Session/Cookie Relevance                        |
| ---------------------------------------------------------------------- | ----------------------------------------------- |
| `src/integrations/supabase/client.ts`                                  | Supabase client config — storage, auth options  |
| `src/hooks/useAuth.tsx`                                                | Auth state hook — subscriptions, signOut        |
| `src/pages/Auth.tsx`                                                   | Login/signup/reset UI — auth event handling     |
| `src/components/ProtectedRoute.tsx`                                    | Route guard — uses useAuth                      |
| `src/services/authService.ts`                                          | Dead code — password validation, updatePassword |
| `src/App.tsx`                                                          | Routing, providers                              |
| `src/main.tsx`                                                         | Entry point                                     |
| `src/lib/env.ts`                                                       | Environment validation                          |
| `src/components/ui/sidebar.tsx`                                        | Cookie usage (sidebar:state)                    |
| `index.html`                                                           | CSP check, inline scripts                       |
| `.env.example`                                                         | Env var documentation                           |
| `vite.config.ts`                                                       | Base URL config                                 |
| `.github/workflows/deploy.yml`                                         | CI/CD — no security headers                     |
| `src/pages/Index.tsx`                                                  | Auth-dependent page                             |
| `src/pages/Statistics.tsx`                                             | Auth-dependent page                             |
| `src/hooks/useUserProfile.ts`                                          | Auth-dependent hook                             |
| `src/hooks/useParkingSpots.ts`                                         | Auth-dependent hook                             |
| `src/hooks/useBookingAudit.ts`                                         | Auth-dependent hook                             |
| `supabase/migrations/20260102000001_fix_security_issues.sql`           | RLS, SECURITY INVOKER                           |
| `supabase/migrations/20260102000002_fix_remaining_security_issues.sql` | RLS optimization                                |
| `supabase/migrations/20260103000001_v2_user_profiles.sql`              | Profile RLS policies                            |
