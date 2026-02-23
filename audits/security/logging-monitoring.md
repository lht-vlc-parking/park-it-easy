# Logging and Monitoring Security Audit

**Date:** 2026-02-23
**Auditor:** Automated Security Audit
**Scope:** Full codebase logging analysis (`src/`, `supabase/`, `.github/workflows/`)
**Application:** park-it-easy-office v2.3.3 (Vite/React 18/TypeScript 5.8 SPA, Supabase backend)
**Risk Score: 7 / 10**

---

## Findings

### F1 — No Error Tracking Service Implemented (Sentry TODO Never Completed)

|                    |                                                                                                                                                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Critical**                                                                                                                                                                                                                                                                                   |
| **CWE**            | CWE-778 (Insufficient Logging)                                                                                                                                                                                                                                                                 |
| **Evidence**       | `src/components/ErrorBoundary.tsx:44`                                                                                                                                                                                                                                                          |
| **What**           | The `ErrorBoundary.componentDidCatch` method contains a TODO comment for Sentry integration that was never implemented. All 57 `console.error`/`console.warn`/`console.log` calls across the codebase write exclusively to the browser console, which is ephemeral and invisible to operators. |
| **Why it matters** | Production JavaScript errors, failed API calls, and authorization failures are silently lost when the user refreshes or closes the tab. There is zero visibility into client-side errors for the development/operations team.                                                                  |

**Exploitability:** Not directly exploitable, but an attacker could trigger errors repeatedly (e.g., brute-force login) with no detection or alerting.

**Remediation:**

```typescript
// src/lib/errorReporting.ts
import * as Sentry from '@sentry/react';

export function initErrorReporting() {
  if (import.meta.env.PROD) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      // Strip PII from error reports
      beforeSend(event) {
        if (event.user) {
          delete event.user.email;
          delete event.user.ip_address;
        }
        return event;
      },
    });
  }
}

// In ErrorBoundary.tsx:44, replace the TODO:
Sentry.captureException(error, {
  contexts: { react: { componentStack: errorInfo.componentStack } },
});
```

---

### F2 — Failed Login Attempts Not Logged Client-Side

|                    |                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                |
| **CWE**            | CWE-778 (Insufficient Logging)                                                                                                                                                                                                                                                                                                          |
| **Evidence**       | `src/pages/Auth.tsx:100-101`                                                                                                                                                                                                                                                                                                            |
| **What**           | When `supabase.auth.signInWithPassword` returns an error (invalid credentials), the code only shows a toast to the user (`toast.error(error.message)`) with no `console.error`, no structured log, and no event sent to any monitoring system. The same applies to signup failures at line 137 and password reset failures at line 168. |
| **Why it matters** | Brute-force attacks and credential-stuffing attempts are completely invisible. There is no way to detect repeated failed logins against the same or multiple accounts. Supabase server-side auth logs exist but the client discards all context (user agent, timestamp, email attempted).                                               |

**Exploitability:** An attacker can attempt unlimited login attempts without any client-side detection mechanism triggering. Supabase's server-side rate limiting is the only protection.

**Remediation:**

```typescript
// src/pages/Auth.tsx — in handleLogin catch block (line 100):
if (error) {
  console.warn('[AUTH] Login failed', {
    email: loginEmail.replace(/(.{2}).*(@.*)/, '$1***$2'), // Mask email
    reason: error.message,
    timestamp: new Date().toISOString(),
  });
  // With Sentry:
  // Sentry.captureMessage('Login failed', { level: 'warning', extra: { reason: error.message } });
  toast.error(error.message || 'Invalid email or password');
}
```

---

### F3 — Supabase Error Objects Logged Unsanitized to Console

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **CWE**            | CWE-532 (Insertion of Sensitive Information into Log File)                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Evidence**       | `src/pages/Index.tsx:65,94,104,115,124`, `src/hooks/useAuth.tsx:20`, `src/hooks/useParkingSpots.ts:39,50,55`, `src/hooks/useStatistics.ts:57-63,73`, `src/hooks/useWaitlist.ts:36,41,79,104`, `src/hooks/useUserProfile.ts:27,32,63`, `src/hooks/useRecurringBookings.ts:29,34,62,87,112`, `src/hooks/useBookingAudit.ts:28,33`, `src/services/bookingService.ts:106,118,204,235,255,273,279,295,304,337,354,360`, `src/services/authService.ts:161,176`, `src/components/BookingDialogWithValidation.tsx:112,128,141,168` |
| **What**           | All 57 console logging calls pass the raw Supabase error object (or caught exception) directly to `console.error()`/`console.warn()`. These error objects may contain internal details like PostgreSQL error codes, table names, column names, constraint names, and query hints. For example, `src/services/bookingService.ts:106` logs `console.error('Error fetching bookings:', error)` where `error` is a Supabase `PostgrestError` that includes `message`, `details`, `hint`, and `code` fields.                    |
| **Why it matters** | While browser console is not remotely accessible, any user with DevTools open can see database schema details (table names, column names, constraint names). This aids an attacker in crafting targeted SQL injection or understanding the data model. If a future error-tracking service is added, these details would be transmitted to a third-party service.                                                                                                                                                           |

**Exploitability:** Low for console-only (requires physical access to DevTools), but Medium if an error tracking service is added without scrubbing.

**Remediation:**

```typescript
// src/lib/logger.ts — Create a safe logging utility
type LogLevel = 'error' | 'warn' | 'info';

export function safeLog(level: LogLevel, message: string, error?: unknown) {
  const sanitized = {
    message,
    timestamp: new Date().toISOString(),
    // Only include safe error properties
    ...(error instanceof Error && { errorMessage: error.message }),
    ...(typeof error === 'object' &&
      error !== null &&
      'code' in error && {
        errorCode: (error as { code: string }).code,
      }),
  };

  // Strip any PII patterns
  const logStr = JSON.stringify(sanitized);
  // Never log full error objects in production
  if (import.meta.env.PROD) {
    console[level](logStr);
  } else {
    console[level](message, error); // Full details in dev
  }
}
```

---

### F4 — `process.env.NODE_ENV` Check in ErrorBoundary Never Evaluates to `'development'`

|                    |                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-215 (Insertion of Sensitive Information Into Debugging Code)                                                                                                                                                                                                                                                                                                                   |
| **Evidence**       | `src/components/ErrorBoundary.tsx:73`                                                                                                                                                                                                                                                                                                                                              |
| **What**           | The ErrorBoundary conditionally renders error details with `process.env.NODE_ENV === 'development'`. In a Vite application, `process.env.NODE_ENV` is `undefined` — Vite uses `import.meta.env.MODE` instead. This means the dev-mode error details block never renders, which is a **false negative** — developers think they have dev-only error display but it never activates. |
| **Why it matters** | Two impacts: (1) developers lose useful error context during development, and (2) the code creates a false sense of security — if someone "fixes" it to use `import.meta.env.MODE`, the error stack traces (including component stack with prop values) would render in the UI, potentially exposing data to shoulder-surfers or screen recordings.                                |

**Exploitability:** Currently non-exploitable (the guard is accidentally always-off). Risk increases if "fixed" naively.

**Remediation:**

```tsx
// src/components/ErrorBoundary.tsx:73
// Replace process.env.NODE_ENV with Vite's equivalent:
{
  import.meta.env.DEV && this.state.error && (
    <div className="max-h-48 overflow-auto rounded-md bg-muted p-4">
      <p className="font-mono text-sm text-destructive">
        {this.state.error.message} {/* Only message, not toString() */}
      </p>
    </div>
  );
}
```

---

### F5 — Raw Supabase Error Messages Displayed to Users via Toast

|                    |                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                   |
| **CWE**            | CWE-209 (Generation of Error Message Containing Sensitive Information)                                                                                                                                                                                                                                                                                                                                       |
| **Evidence**       | `src/pages/Auth.tsx:101`, `src/pages/Index.tsx:96-97,117-118`, `src/pages/Auth.tsx:137,169`                                                                                                                                                                                                                                                                                                                  |
| **What**           | Multiple locations pass `error.message` directly from Supabase responses into user-visible toast notifications. For example, `src/pages/Index.tsx:96`: `toast.error(error.message \|\| 'Failed to create booking')`. Supabase error messages can include internal details like "duplicate key value violates unique constraint", "new row violates row-level security policy", or PostgreSQL function names. |
| **Why it matters** | Internal database error messages exposed to the user reveal implementation details (table names, constraint names, RLS policy names) that aid attack reconnaissance.                                                                                                                                                                                                                                         |

**Exploitability:** An attacker can trigger constraint violations or RLS errors intentionally to enumerate database structure.

**Remediation:**

```typescript
// Use generic user-facing messages, log the detail internally
if (error) {
  console.error('[BOOKING] Create failed:', error.code, error.message);
  // Show generic message to user
  toast.error('Failed to create booking. Please try again.');
  return;
}
```

---

### F6 — No Structured Logging Format

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **CWE**            | CWE-117 (Improper Output Neutralization for Logs)                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Evidence**       | All 57 console calls across the codebase                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **What**           | Every log statement uses unstructured `console.error('string message', errorObject)` format. There is no consistent log format, no correlation IDs, no severity levels, no timestamp injection, and no user context. Log messages are plain English strings with no machine-parseable structure.                                                                                                                                                              |
| **Why it matters** | Unstructured logs cannot be searched, aggregated, or alerted on. Even if an error tracking service is added, the lack of correlation IDs means it is impossible to trace a user's journey through a multi-step operation (e.g., validate booking -> check conflicts -> create booking). Log injection is also possible since user-controlled strings (error messages from Supabase which may include user input) are concatenated directly into log messages. |

**Exploitability:** If user-controlled data flows into Supabase error messages (e.g., via malformed input that gets reflected in a constraint error), it could pollute log output. Low practical impact for browser console but Medium for any future log aggregation.

**Remediation:**

```typescript
// src/lib/logger.ts
interface LogEntry {
  level: 'error' | 'warn' | 'info';
  event: string; // Machine-readable event name
  message: string;
  timestamp: string;
  correlationId?: string;
  userId?: string; // Hashed, not raw
  metadata?: Record<string, unknown>;
}

export function log(entry: Omit<LogEntry, 'timestamp'>) {
  const fullEntry: LogEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  // Sanitize: ensure no PII in metadata values
  console[entry.level](JSON.stringify(fullEntry));
}

// Usage:
log({
  level: 'error',
  event: 'booking.create.failed',
  message: 'Failed to create booking',
  metadata: { errorCode: error.code, spotNumber: 84 },
});
```

---

### F7 — No Client-Side Security Event Auditing

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **CWE**            | CWE-778 (Insufficient Logging)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Evidence**       | `src/pages/Auth.tsx` (entire file), `src/hooks/useAuth.tsx` (entire file)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **What**           | Security-critical events are not logged anywhere: (1) Failed login attempts — `Auth.tsx:100-101` shows a toast but logs nothing, (2) Successful logins — `Auth.tsx:103-104` navigates away with no log, (3) Sign-out events — `useAuth.tsx:37` calls `signOut()` with no logging, (4) Password reset requests — `Auth.tsx:164-170` logs nothing on success/failure, (5) Authorization failures (RLS denials) — various hooks silently swallow Supabase RLS errors. The `booking_audit` table only tracks booking CRUD operations, not security events. |
| **Why it matters** | Without security event logging, there is no forensic trail for incident response. An account compromise would be undetectable after the fact.                                                                                                                                                                                                                                                                                                                                                                                                          |

**Exploitability:** An attacker who compromises an account can operate indefinitely without leaving client-side traces. Only Supabase server-side auth logs (if enabled) would contain evidence.

**Remediation:**

```typescript
// src/lib/securityEvents.ts
type SecurityEvent =
  | 'login.success'
  | 'login.failure'
  | 'signup.success'
  | 'signup.failure'
  | 'logout'
  | 'password_reset.request'
  | 'session.expired'
  | 'authorization.denied';

export function logSecurityEvent(event: SecurityEvent, metadata?: Record<string, unknown>) {
  const entry = {
    event,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
    // Optionally send to Supabase security_events table or Sentry breadcrumb
    ...metadata,
  };
  console.info('[SECURITY]', JSON.stringify(entry));
  // Sentry.addBreadcrumb({ category: 'security', message: event, data: metadata });
}
```

---

### F8 — Environment Variables Logged in Development Mode

|                    |                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                                         |
| **CWE**            | CWE-532 (Insertion of Sensitive Information into Log File)                                                                                                                                                                                                                                                                                                                      |
| **Evidence**       | `src/lib/env.ts:80-85`                                                                                                                                                                                                                                                                                                                                                          |
| **What**           | When `env.DEV` is true, the application logs environment configuration to console: `console.log('Environment:', { mode, supabaseConfigured, baseUrl })`. While the current payload only includes `mode`, `supabaseConfigured` (boolean), and `baseUrl`, this pattern is risky — future developers may add sensitive values to this debug output without realizing it is logged. |
| **Why it matters** | The logged data currently does not include secrets (the Supabase URL and key are not logged). However, the `isSupabaseConfigured` flag confirms to an attacker that Supabase is in use, and the pattern invites future expansion that could leak keys.                                                                                                                          |

**Exploitability:** Low. No secrets currently leaked. Informational.

**Remediation:**

```typescript
// src/lib/env.ts:80-85
// Guard with explicit allowlist and add a comment warning
if (env.DEV) {
  // WARNING: Never log VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY here
  console.log('Environment:', { mode: env.MODE });
}
```

---

### F9 — `booking_audit` Table Lacks IP Address and User Agent Population

|                    |                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **Medium**                                                                                                                                                                                                                                                                                                                                                  |
| **CWE**            | CWE-778 (Insufficient Logging)                                                                                                                                                                                                                                                                                                                              |
| **Evidence**       | `supabase/migrations/20260103000003_v2_booking_audit.sql:15-16,47-59,72-86`                                                                                                                                                                                                                                                                                 |
| **What**           | The `booking_audit` table defines `ip_address INET` and `user_agent TEXT` columns (lines 15-16), but the trigger functions `log_booking_created()`, `log_booking_cancelled()`, and `log_booking_modified()` never populate these fields. The INSERT statements in all three functions omit `ip_address` and `user_agent`, so these columns are always NULL. |
| **Why it matters** | The audit trail cannot correlate booking operations to specific client sessions. In a security incident, investigators cannot determine which device or network a malicious booking change originated from.                                                                                                                                                 |

**Exploitability:** Not directly exploitable, but severely hampers incident response.

**Remediation:**

```sql
-- Option 1: Use Supabase request headers (available in Edge Functions, not triggers)
-- Option 2: Pass IP/UA from the client via an RPC call instead of direct INSERT
-- Option 3: Use a Supabase Edge Function as a proxy for booking operations

-- For the trigger approach, current_setting can access some request context:
CREATE OR REPLACE FUNCTION public.log_booking_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.booking_audit (booking_id, user_id, action, new_data, ip_address, user_agent)
  VALUES (
    NEW.id, NEW.user_id, 'created',
    jsonb_build_object(
      'date', NEW.date, 'duration', NEW.duration,
      'vehicle_type', NEW.vehicle_type, 'spot_number', NEW.spot_number,
      'user_name', NEW.user_name
    ),
    -- These headers are available in Supabase PostgREST context:
    nullif(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
    nullif(current_setting('request.headers', true)::json->>'user-agent', '')
  );
  RETURN NEW;
END;
$$;
```

---

### F10 — No Monitoring, Alerting, or Anomaly Detection

|                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Severity**       | **High**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **CWE**            | CWE-778 (Insufficient Logging)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Evidence**       | `.github/workflows/deploy.yml` (entire file), `.github/workflows/security-scan.yml` (entire file), absence of any monitoring configuration                                                                                                                                                                                                                                                                                                                                                                        |
| **What**           | There are no monitoring or alerting systems configured anywhere in the codebase: (1) No uptime monitoring (e.g., Pingdom, UptimeRobot), (2) No error rate alerting (e.g., Sentry alerts, PagerDuty), (3) No anomaly detection for unusual booking patterns, (4) No client-side performance monitoring (e.g., Web Vitals reporting), (5) No Supabase usage/quota monitoring. The `security-scan.yml` workflow runs daily SBOM vulnerability scans (good), but this is dependency scanning, not runtime monitoring. |
| **Why it matters** | The application could be completely down, under attack, or experiencing data corruption with no automated notification to the team. Discovery of issues depends entirely on user reports.                                                                                                                                                                                                                                                                                                                         |

**Exploitability:** An attacker could exfiltrate data, corrupt bookings, or DoS the application for extended periods without detection.

**Remediation:**

```yaml
# .github/workflows/uptime-check.yml (minimal example)
name: Uptime Check
on:
  schedule:
    - cron: '*/15 * * * *' # Every 15 minutes
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check site is up
        run: |
          STATUS=$(curl -o /dev/null -s -w "%{http_code}" https://miguel11nines.github.io/park-it-easy-office/)
          if [ "$STATUS" != "200" ]; then
            echo "Site returned HTTP $STATUS"
            exit 1
          fi
```

For comprehensive monitoring, consider:

1. **Sentry** for error tracking and alerting
2. **Supabase Dashboard Alerts** for database usage anomalies
3. **Web Vitals** reporting via `web-vitals` library to track performance regressions

---

### F11 — 404 Route Logging Includes User-Controlled Path Without Sanitization

|                    |                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Severity**       | **Low**                                                                                                                                                                                                                                                                                                                                                                                    |
| **CWE**            | CWE-117 (Improper Output Neutralization for Logs)                                                                                                                                                                                                                                                                                                                                          |
| **Evidence**       | `src/pages/NotFound.tsx:11`                                                                                                                                                                                                                                                                                                                                                                |
| **What**           | The 404 handler logs: `console.error("404 Error: User attempted to access non-existent route:", location.pathname)`. The `location.pathname` is user-controlled (from the URL bar) and is logged without any sanitization. While browser console is relatively safe from injection, this is a log injection vector if logs are ever forwarded to a service that renders or processes them. |
| **Why it matters** | A crafted URL containing newlines or control characters could corrupt log formatting or inject fake log entries in a log aggregation system.                                                                                                                                                                                                                                               |

**Exploitability:** Low for browser console. Medium if logs are forwarded to a centralized logging system.

**Remediation:**

```typescript
// src/pages/NotFound.tsx:11
const sanitizedPath = location.pathname.replace(/[^\w/.-]/g, '_');
console.error('[ROUTING] 404 Not Found:', sanitizedPath);
```

---

## Summary Risk Score: 7/10

**Rationale:** The application has essentially **zero operational visibility** into client-side behavior. While the Supabase backend provides some server-side logging for database operations, the client-side SPA operates as a complete blind spot. The combination of no error tracking (F1), no security event logging (F2, F7), no monitoring (F10), and console-only ephemeral logging (all findings) creates a situation where security incidents, application errors, and performance degradation can persist indefinitely without detection.

The score is not higher because: (1) the application does not log passwords, tokens, or API keys (good), (2) Supabase provides server-side auth logging and RLS enforcement, (3) the `booking_audit` table provides partial audit trail for data changes, and (4) the attack surface is relatively small (parking management for a single team).

---

## Top 5 Prioritized Fixes

1. **Integrate an error tracking service (Sentry)** — Resolves F1, partially F2, F7, F10. Highest impact single change. Provides error visibility, alerting, and user session replay.

2. **Add security event logging** — Resolves F2, F7. Log authentication events (login success/failure, logout, password reset) to both the browser and an external service. Consider a `security_events` Supabase table.

3. **Create a structured logging utility** — Resolves F3, F5, F6, F11. Replace all 57 raw `console.*` calls with a centralized logger that sanitizes error objects, uses structured JSON format, and separates user-facing messages from internal error details.

4. **Populate `booking_audit.ip_address` and `booking_audit.user_agent`** — Resolves F9. Use PostgREST request headers in trigger functions to capture client context for forensic audit capability.

5. **Add basic uptime and error-rate monitoring** — Resolves F10. At minimum, add a GitHub Actions cron-based uptime check. Ideally, configure Sentry alerting thresholds for error spikes.

---

## Logging Compliance Checklist

| #   | Item                          | Status      | Notes                                                                                                                                        |
| --- | ----------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Passwords not logged          | **Pass**    | Auth.tsx passes passwords to Supabase SDK only; no `console.*` call includes password values                                                 |
| 1.2 | Tokens not logged             | **Pass**    | Session tokens handled internally by Supabase SDK; no token values in console output                                                         |
| 1.3 | PII not logged                | **Pass**    | User emails, names, and IDs are not directly logged (error objects may contain `user_id` in Supabase responses but these are UUIDs, not PII) |
| 1.4 | API keys not logged           | **Pass**    | `env.ts:81-85` logs `supabaseConfigured` boolean, not the actual keys; `client.ts` reads keys but does not log them                          |
| 2.1 | Failed login attempts logged  | **Fail**    | `Auth.tsx:100-101` — only shows toast, no log output (F2)                                                                                    |
| 2.2 | Authorization failures logged | **Fail**    | RLS denials from Supabase logged as generic "Error fetching..." with no security categorization (F7)                                         |
| 2.3 | Validation failures logged    | **Fail**    | Client-side validation failures in `Auth.tsx:53-83` show toasts only, no logging; `BookingDialogWithValidation.tsx` same pattern             |
| 2.4 | System errors logged          | **Partial** | Errors are logged to `console.error` (57 calls), but these are ephemeral and unstructured (F1, F6)                                           |
| 3.1 | Input sanitization in logs    | **Fail**    | `NotFound.tsx:11` logs unsanitized `location.pathname`; all error objects logged raw (F11, F6)                                               |
| 3.2 | Structured logging            | **Fail**    | All logging is unstructured `console.error('string', object)` (F6)                                                                           |
| 4.1 | Secure log storage            | **Fail**    | Browser console only — no persistent storage; `booking_audit` table provides partial DB-level audit (F1)                                     |
| 4.2 | Log rotation                  | **N/A**     | No persistent log storage exists to rotate                                                                                                   |
| 4.3 | Log backup                    | **N/A**     | No persistent log storage exists to back up                                                                                                  |
| 5.1 | Unusual activity detection    | **Fail**    | No anomaly detection for login patterns, booking patterns, or usage spikes (F10)                                                             |
| 5.2 | Error rate monitoring         | **Fail**    | No error rate tracking or alerting (F1, F10)                                                                                                 |
| 5.3 | Performance anomalies         | **Fail**    | No client-side performance monitoring (no Web Vitals, no LCP/FID tracking) (F10)                                                             |
