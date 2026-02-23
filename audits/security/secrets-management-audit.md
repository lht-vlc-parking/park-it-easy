# Secrets Management Audit

**Date:** 2026-02-23
**Auditor:** Security Audit (automated)
**Scope:** Full codebase, CI/CD workflows, config files, Docker, git history
**Project:** park-it-easy-office v2.3.3 (Vite/React 18/TypeScript 5.8 SPA + Supabase)
**Risk Score: 3 / 10**

---

## Findings

### F1 — Hardcoded Production URL in `useAuth.tsx`

|                    |                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                     |
| **CWE**            | CWE-798 (Use of Hard-coded Credentials)                                                                                                                                                                                                                                                                                        |
| **Evidence**       | `src/hooks/useAuth.tsx:39`                                                                                                                                                                                                                                                                                                     |
| **What**           | The `signOut` function redirects to a hardcoded GitHub Pages URL: `'https://miguel11nines.github.io/park-it-easy-office/auth'` instead of deriving it from the environment or router.                                                                                                                                          |
| **Why it matters** | If the deployment URL changes (custom domain, different repo name, fork), users will be redirected to the wrong origin after sign-out. While not a credential leak, hardcoded deployment URLs are a configuration smell that couples source code to a single deployment target and can cause open-redirect-adjacent confusion. |

**Exploitability:** Low. An attacker cannot leverage this directly, but it creates a maintenance and correctness risk if the app is deployed elsewhere.

**Remediation:**

```tsx
// src/hooks/useAuth.tsx – replace line 39
import { getAuthRedirectUrl } from '@/services/authService';

const signOut = async () => {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
  window.location.href = getAuthRedirectUrl('auth');
};
```

Note: `getAuthRedirectUrl` already exists in `src/services/authService.ts:40` and correctly derives the URL from `window.location.origin` + `import.meta.env.BASE_URL`.

---

### F2 — Incorrect Environment Variable Mechanism in `ErrorBoundary.tsx`

|                    |                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                    |
| **CWE**            | CWE-215 (Insertion of Sensitive Information Into Debugging Code)                                                                                                                                                                                                                           |
| **Evidence**       | `src/components/ErrorBoundary.tsx:73`                                                                                                                                                                                                                                                      |
| **What**           | Uses `process.env.NODE_ENV` instead of Vite's `import.meta.env.MODE` or `import.meta.env.DEV`. In a Vite build, `process.env.NODE_ENV` is statically replaced only if the bundler is configured to do so. Vite does replace it during build, but the pattern is non-idiomatic and fragile. |
| **Why it matters** | If the static replacement fails or the code is evaluated in a context where `process.env` is not shimmed (e.g., SSR, test runner edge cases), the condition may incorrectly evaluate, potentially exposing stack traces and component trees in production.                                 |

**Exploitability:** Low. Vite currently replaces `process.env.NODE_ENV` at build time, so in practice the guard works. But relying on this is brittle.

**Remediation:**

```tsx
// src/components/ErrorBoundary.tsx – replace line 73
{import.meta.env.DEV && this.state.error && (
```

---

### F3 — Test File Contains JWT-Shaped Fixture String

|                    |                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Informational**                                                                                                                                                                                                                                                 |
| **CWE**            | CWE-798 (Use of Hard-coded Credentials)                                                                                                                                                                                                                           |
| **Evidence**       | `src/test/env.test.ts:19`                                                                                                                                                                                                                                         |
| **What**           | The test uses `'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'` as a fixture value for `VITE_SUPABASE_PUBLISHABLE_KEY`. This is a well-known JWT header prefix (the Base64 encoding of `{"alg":"HS256","typ":"JWT"}`) with no payload or signature — it is not a real key. |
| **Why it matters** | Minimal risk. Automated secret scanners (e.g., GitHub secret scanning, TruffleHog, gitleaks) will flag `eyJ...` patterns. Using a clearly-fake value like `'test-anon-key-not-real'` avoids false positives.                                                      |

**Exploitability:** None. The string is an incomplete, unsigned JWT header with no payload. It cannot authenticate against any Supabase instance.

**Remediation:**

```ts
// src/test/env.test.ts – replace line 19
VITE_SUPABASE_PUBLISHABLE_KEY: 'test-anon-key-not-real',
```

---

### F4 — Test File Contains Hardcoded Production Origin

|                    |                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Informational**                                                                                                                                                         |
| **CWE**            | CWE-798 (Use of Hard-coded Credentials)                                                                                                                                   |
| **Evidence**       | `src/test/auth.test.ts:65`                                                                                                                                                |
| **What**           | The test hardcodes `'https://miguel11nines.github.io'` as the expected production origin. This is not a secret, but it tightly couples the test to a specific deployment. |
| **Why it matters** | If the deployment target changes, tests will need manual updates. Not a security issue per se.                                                                            |

**Exploitability:** None.

**Remediation:** Extract the production origin to a shared test constant or derive it from configuration.

---

### F5 — Docker Compose Does Not Pass Supabase Env Vars

|                    |                                                                                                                                                                                                                                           |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                   |
| **CWE**            | CWE-260 (Password in Configuration File) — inverted finding                                                                                                                                                                               |
| **Evidence**       | `docker-compose.yml:14-15`                                                                                                                                                                                                                |
| **What**           | The `docker-compose.yml` only sets `NODE_ENV=development` and does not reference `.env` via `env_file:` or pass `VITE_SUPABASE_*` vars. This means the Docker dev environment runs in "demo mode" without Supabase.                       |
| **Why it matters** | Positive finding from a secrets perspective — no secrets leak through Docker config. However, it means Docker-based development cannot connect to Supabase without manual modification, and developers may be tempted to hardcode values. |

**Exploitability:** None — this is a usability gap, not a vulnerability.

**Remediation (optional, for developer experience):**

```yaml
# docker-compose.yml – add under `services.app`
env_file:
  - .env
```

The `.env` file is already in `.gitignore` (line 19), so this is safe.

---

### F6 — No Secret Rotation Documentation or Automation

|                    |                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                           |
| **CWE**            | CWE-324 (Use of a Key Past its Expiration Date)                                                                                                                                                                                                                   |
| **Evidence**       | Project-wide                                                                                                                                                                                                                                                      |
| **What**           | There is no documentation or automation for rotating the Supabase anon key, Supabase service role key (if used server-side), or GitHub Actions secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`).                                                    |
| **Why it matters** | For this SPA architecture where the anon key is public and security relies on Supabase RLS, the risk is low. However, if the project ever adds a server-side component with the Supabase service role key, the absence of rotation procedures becomes a real gap. |

**Exploitability:** Low for current architecture. The anon key is designed to be public.

**Remediation:** Add a `docs/secret-rotation.md` documenting:

1. How to regenerate the Supabase anon key in the Supabase Dashboard
2. How to update `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in GitHub Secrets
3. How to verify the deployment works after rotation

---

## Architecture Assessment (Context)

This project has a fundamentally sound secrets management posture for its architecture:

- **Supabase anon key is public by design.** Supabase explicitly documents that the anon key is safe to expose in client-side code. Security is enforced by Row Level Security (RLS) policies on the database, not by key secrecy. The `VITE_` prefix correctly exposes it to the client bundle.
- **No server-side secrets exist.** This is a pure SPA deployed to GitHub Pages. There is no backend server, no database password, no service role key in the codebase.
- **No encryption key management exists** because the application does not perform client-side encryption. Supabase handles all data-at-rest and data-in-transit encryption.
- **CI/CD uses GitHub Secrets correctly.** Both `deploy.yml:42-43` and `release.yml:64-66` inject `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from `${{ secrets.* }}`, which are masked in logs and never printed.

---

## Summary Risk Score: 3/10

The codebase has **no critical or high-severity secrets management issues**. The primary finding (F1) is a medium-severity hardcoded URL that should be addressed for correctness. All other findings are low/informational. The architecture inherently limits secrets exposure because it is a client-side SPA with no server-side secrets.

---

## Top 5 Prioritized Fixes

1. **F1 — Replace hardcoded production URL** in `src/hooks/useAuth.tsx:39` with `getAuthRedirectUrl('auth')`. This is a straightforward one-line fix using an existing utility function. _(Medium)_
2. **F2 — Replace `process.env.NODE_ENV`** in `src/components/ErrorBoundary.tsx:73` with `import.meta.env.DEV` to use Vite's idiomatic environment check and prevent potential stack trace leaks. _(Low)_
3. **F3 — Replace JWT-shaped test fixture** in `src/test/env.test.ts:19` with a clearly-fake string to avoid secret scanner false positives. _(Informational)_
4. **F5 — Add `env_file: [.env]`** to `docker-compose.yml` so Docker-based development can pick up Supabase config without hardcoding. _(Low)_
5. **F6 — Document secret rotation procedures** for Supabase keys and GitHub Actions secrets. _(Low)_

---

## Checklist (Pass/Fail/N/A)

| #   | Item                                | Status   | Notes                                                                                                                                                 |
| --- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | No hardcoded API keys               | **Pass** | No Supabase keys, tokens, or API keys found in source code or git history                                                                             |
| 1.2 | No hardcoded DB passwords           | **Pass** | No database passwords anywhere; Supabase handles auth via anon key + RLS                                                                              |
| 1.3 | No hardcoded JWT secrets            | **Pass** | Test fixture at `env.test.ts:19` is a well-known JWT header fragment, not a real secret                                                               |
| 1.4 | No hardcoded encryption keys        | **Pass** | No encryption is performed client-side                                                                                                                |
| 2.1 | All secrets in env vars             | **Pass** | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` loaded via `import.meta.env` in `src/lib/env.ts` and `src/integrations/supabase/client.ts`    |
| 2.2 | `.env` not in git                   | **Pass** | `.gitignore:19-21` excludes `.env`, `.env.local`, and `.env.*.local`; git history confirms no `.env` was ever committed                               |
| 2.3 | Production vs dev configs separated | **Pass** | CI/CD injects production values via GitHub Secrets; local dev uses `.env` file; Vite `MODE` distinguishes environments; `env.ts` validates at runtime |
| 3.1 | DB password rotation capability     | **N/A**  | No direct database connection; Supabase manages all DB credentials                                                                                    |
| 3.2 | API key rotation capability         | **Fail** | No documented procedure for rotating Supabase anon key or updating GitHub Secrets (F6)                                                                |
| 3.3 | Certificate rotation                | **N/A**  | GitHub Pages manages TLS certificates; Supabase manages their own                                                                                     |
| 4.1 | Key derivation functions            | **N/A**  | No client-side encryption or key derivation                                                                                                           |
| 4.2 | Salt usage                          | **N/A**  | No client-side hashing; Supabase handles password hashing server-side                                                                                 |
| 4.3 | Key storage                         | **N/A**  | No client-side key storage; session tokens managed by Supabase SDK in `localStorage` (covered in separate session security audit)                     |

---

## Files Reviewed

| File                                  | Verdict                                                          |
| ------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/env.ts`                      | Clean — Zod-validated env vars, no hardcoded values              |
| `src/integrations/supabase/client.ts` | Clean — reads from `import.meta.env`, graceful fallback          |
| `.env.example`                        | Clean — placeholder values only                                  |
| `vite.config.ts`                      | Clean — no secrets                                               |
| `.github/workflows/deploy.yml`        | Clean — uses `${{ secrets.* }}`                                  |
| `.github/workflows/release.yml`       | Clean — uses `${{ secrets.* }}`                                  |
| `.github/workflows/security-scan.yml` | Clean — uses `${{ secrets.GITHUB_TOKEN }}` (auto-provided)       |
| `.github/workflows/test.yml`          | Clean — no secrets needed for tests                              |
| `docker-compose.yml`                  | Clean — no secrets, but missing `env_file` for DX                |
| `.gitignore`                          | Clean — `.env` variants properly excluded                        |
| `src/hooks/useAuth.tsx`               | **F1** — hardcoded production URL at line 39                     |
| `src/pages/Auth.tsx`                  | Clean — no hardcoded secrets                                     |
| `src/pages/Index.tsx`                 | Clean — no hardcoded secrets                                     |
| `src/pages/Statistics.tsx`            | Clean — no hardcoded secrets                                     |
| `src/services/authService.ts`         | Clean — derives URLs from `import.meta.env.BASE_URL`             |
| `src/services/bookingService.ts`      | Clean — no secrets                                               |
| `src/components/ErrorBoundary.tsx`    | **F2** — `process.env.NODE_ENV` instead of `import.meta.env.DEV` |
| `src/test/env.test.ts`                | **F3** — JWT-shaped fixture string                               |
| `src/test/auth.test.ts`               | **F4** — hardcoded production origin                             |
| `scripts/delete-deployments.mjs`      | Clean — correctly requires `GH_TOKEN`/`GITHUB_TOKEN` from env    |
| `supabase/config.toml`                | Clean — project ID commented out with placeholder                |
| `package.json`                        | Clean — no secrets                                               |
