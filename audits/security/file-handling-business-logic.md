# File Handling & Business Logic Security Audit

**Date:** 2026-02-23
**Auditor:** Security Audit (automated)
**Scope:** Full codebase scan for file handling functionality
**Version:** park-it-easy-office v2.3.3
**Risk Score: 1 / 10**

---

## Executive Summary

This application **does not** have any file upload, file download, file processing, or Supabase Storage functionality. After a comprehensive review of all pages, components, hooks, services, SQL migrations, Supabase types, and dependencies, **zero file handling code paths were found**. All standard file-handling audit items are therefore **N/A**.

One minor observation warrants attention: the `user_profiles` table includes an `avatar_url` column that is currently unused by any frontend code. This represents a **latent future risk** if file uploads are added later without proper security controls.

The overall risk score of **1/10** reflects the effectively zero attack surface from a file-handling perspective, with the single point deducted for the unused `avatar_url` schema field that could invite insecure implementation later.

---

## Methodology

The following artifacts were reviewed exhaustively:

| Category             | Files Reviewed                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages                | `src/pages/Auth.tsx`, `src/pages/Index.tsx`, `src/pages/Statistics.tsx`                                                                                                                                               |
| Components           | `src/components/BookingDialogWithValidation.tsx`, `src/components/ParkingSpotCard.tsx`, `src/components/ErrorBoundary.tsx`                                                                                            |
| Hooks                | `src/hooks/useAuth.tsx`, `src/hooks/useParkingSpots.ts`, `src/hooks/useStatistics.ts`, `src/hooks/useWaitlist.ts`, `src/hooks/useUserProfile.ts`, `src/hooks/useRecurringBookings.ts`, `src/hooks/useBookingAudit.ts` |
| Services             | `src/services/authService.ts`, `src/services/bookingService.ts`                                                                                                                                                       |
| Supabase Integration | `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`                                                                                                                                           |
| SQL Migrations       | All 21 migration files in `supabase/migrations/`                                                                                                                                                                      |
| Package manifest     | `package.json`                                                                                                                                                                                                        |

Additionally, automated regex scans were performed across the entire TypeScript/TSX codebase for:

- File input elements (`input type="file"`, `FileReader`, `FileList`, `FormData`, `Blob`, `createObjectURL`)
- Storage APIs (`supabase.storage`, `bucket`, `upload`, `download`)
- Export/download libraries (`csv`, `pdf`, `xlsx`, `file-saver`, `jspdf`, `papaparse`)

**All scans returned zero matches for actual file-handling code.**

---

## Findings

### F1 — Unused `avatar_url` Column in Schema (Informational / Low)

**Severity:** Informational
**Location:** `supabase/migrations/20260103000001_v2_user_profiles.sql:9`, `src/integrations/supabase/types.ts:55`

The `user_profiles` table defines an `avatar_url TEXT` column:

```sql
-- supabase/migrations/20260103000001_v2_user_profiles.sql:9
avatar_url TEXT,
```

This column is reflected in the TypeScript types (`src/integrations/supabase/types.ts:55`, `:67`, `:79`) but is **never read, written, or displayed** by any frontend component, hook, or service.

**Risk:** If a developer later adds avatar upload functionality using this column, they may:

- Store unsanitized URLs (XSS via `javascript:` or `data:` URIs)
- Accept arbitrary file types without validation
- Skip Supabase Storage bucket policies
- Allow unrestricted file sizes
- Not validate MIME types or magic numbers

**Recommendation:** Either remove the `avatar_url` column if not planned, or document the security requirements that must be met before implementing avatar uploads (see [Future Considerations](#future-considerations)).

---

### F2 — No Data Export Functionality (Informational)

**Severity:** Informational
**Location:** `src/pages/Statistics.tsx` (entire file, 1465 lines)

The Statistics page (`src/pages/Statistics.tsx`) displays extensive analytics (fairness scores, occupancy charts, booking trends, user rankings) but provides **no export functionality** (no CSV, PDF, or JSON download). All data is rendered in-browser only.

**Risk:** None currently. However, if export is added later:

- CSV injection attacks are possible if booking data (e.g., `user_name`) contains formula characters (`=`, `+`, `-`, `@`)
- PDF generation libraries can have server-side vulnerabilities if used incorrectly
- Large data exports could be used for DoS if not rate-limited

---

### F3 — No File Processing Libraries in Dependencies (Confirmed Safe)

**Severity:** None
**Location:** `package.json:45-127`

A review of all 46 runtime dependencies and 22 dev dependencies confirms:

- **No file upload libraries** (e.g., `multer`, `busboy`, `formidable`, `react-dropzone`)
- **No file processing libraries** (e.g., `file-saver`, `jspdf`, `papaparse`, `xlsx`, `pdfkit`)
- **No image processing libraries** (runtime; `sharp` is dev-only for favicon generation at `package.json:121`)
- **No Supabase Storage SDK usage** (the Supabase client at `src/integrations/supabase/client.ts` only uses `auth` methods and database queries)

The `sharp` dependency (`package.json:121`) is a **devDependency** used only for build-time favicon generation (`scripts/generate-favicons.mjs`) and is not included in the production bundle.

---

### F4 — No Supabase Storage Buckets or Policies (Confirmed Safe)

**Severity:** None
**Location:** All 21 files in `supabase/migrations/`

A scan of all SQL migration files found:

- **Zero** references to `storage.buckets`, `storage.objects`, or any Supabase Storage policy
- **Zero** `CREATE POLICY` statements on storage tables
- The only storage-adjacent term found is `avatar_url` as a plain TEXT column (F1 above)

---

## No File Handling Found — Full Assessment

| Check                       | Status  | Notes                                                            |
| --------------------------- | ------- | ---------------------------------------------------------------- |
| File upload endpoints       | **N/A** | No file upload inputs, APIs, or handlers exist anywhere          |
| File type validation        | **N/A** | No files are accepted by the application                         |
| File size limits            | **N/A** | No files are accepted by the application                         |
| Filename sanitization       | **N/A** | No filenames are processed                                       |
| Anti-virus scanning         | **N/A** | No files are stored or processed                                 |
| Storage location security   | **N/A** | No Supabase Storage buckets configured                           |
| Direct execution prevention | **N/A** | No uploaded files exist to execute                               |
| MIME type validation        | **N/A** | No files are accepted                                            |
| Magic number verification   | **N/A** | No files are accepted                                            |
| ZIP bomb protection         | **N/A** | No archive files are processed                                   |
| Path traversal prevention   | **N/A** | No file paths are user-controllable                              |
| Content-Disposition headers | **N/A** | No file downloads exist                                          |
| Data export (CSV/PDF)       | **N/A** | No export functionality exists (Statistics page is display-only) |
| Client-side file generation | **N/A** | No `Blob`, `createObjectURL`, or `FileReader` usage found        |

---

## Future Considerations

If file handling is added to this application (e.g., avatar uploads, document attachments, data exports), the following security controls **must** be implemented:

### For File Uploads (e.g., Avatar Photos)

1. **Use Supabase Storage with RLS policies** — create a dedicated bucket with row-level security. Do not store files as base64 in database columns.
2. **File type allowlist** — restrict to specific MIME types (e.g., `image/jpeg`, `image/png`, `image/webp`). Validate both the `Content-Type` header and the file's magic number bytes.
3. **File size limits** — enforce a maximum size (e.g., 2 MB for avatars) both client-side and via Supabase bucket configuration.
4. **Filename sanitization** — strip path separators, null bytes, and special characters. Generate UUIDs for stored filenames.
5. **Image processing** — use a library like `sharp` to re-encode uploaded images, stripping EXIF data and neutralizing image-based exploits.
6. **Content-Security-Policy** — ensure `img-src` restricts image loading to your Supabase Storage domain.
7. **Avatar URL validation** — if using the existing `avatar_url` column, validate that values are HTTPS URLs pointing to your Supabase Storage domain only. Never render arbitrary URLs in `<img>` tags without validation.
8. **Bucket policies** — configure Supabase Storage with:
   - Authenticated-only uploads
   - Per-user path isolation (e.g., `avatars/{user_id}/`)
   - Public read access only for avatar buckets
   - Maximum file size at the bucket level

### For Data Export (CSV/PDF)

1. **CSV injection prevention** — prefix cell values starting with `=`, `+`, `-`, `@`, `\t`, `\r` with a single quote or tab character.
2. **Rate limiting** — prevent DoS via repeated large export requests.
3. **Data access control** — ensure exports respect the same RLS policies as the UI (users should not be able to export data they cannot view).
4. **Content-Disposition** — always set `Content-Disposition: attachment` headers for downloads.

### General

1. **No direct execution** — never serve uploaded files with executable MIME types. Configure storage to serve all uploads with `Content-Type: application/octet-stream` or the validated MIME type.
2. **Virus scanning** — for enterprise deployments, integrate ClamAV or a cloud-based scanner before accepting uploads.
3. **Audit logging** — extend the existing `booking_audit` pattern to log file upload/delete operations.

---

## Checklist (Pass/Fail/N/A)

| #   | Item                                            | Status   | Evidence                                      |
| --- | ----------------------------------------------- | -------- | --------------------------------------------- |
| 1   | File type validation                            | **N/A**  | No file uploads exist                         |
| 2   | File size limits                                | **N/A**  | No file uploads exist                         |
| 3   | Filename sanitization                           | **N/A**  | No filenames processed                        |
| 4   | Anti-virus scanning                             | **N/A**  | No file storage                               |
| 5   | Storage location security                       | **N/A**  | No Supabase Storage buckets                   |
| 6   | Direct execution prevention                     | **N/A**  | No uploaded files                             |
| 7   | MIME type validation                            | **N/A**  | No file uploads                               |
| 8   | Magic number verification                       | **N/A**  | No file uploads                               |
| 9   | ZIP bomb protection                             | **N/A**  | No archive processing                         |
| 10  | Path traversal prevention                       | **N/A**  | No file paths                                 |
| 11  | Content-Disposition headers                     | **N/A**  | No file downloads                             |
| 12  | CSV injection prevention                        | **N/A**  | No data export                                |
| 13  | Unused schema fields reviewed                   | **PASS** | `avatar_url` identified and documented (F1)   |
| 14  | No file-processing libraries in production deps | **PASS** | `sharp` is dev-only (`package.json:121`)      |
| 15  | No Supabase Storage configuration               | **PASS** | Zero storage references in 21 migration files |

---

## Summary Risk Score: 1/10

| Factor                               | Score    | Rationale                                   |
| ------------------------------------ | -------- | ------------------------------------------- |
| Current file handling attack surface | 0        | No file handling exists                     |
| Unused `avatar_url` column risk      | +0.5     | Latent risk if implemented without controls |
| Missing data export (informational)  | +0.5     | Minor gap; no export for statistics data    |
| **Total**                            | **1/10** | Minimal risk; no action required now        |

**Conclusion:** The application has no file handling functionality and therefore presents effectively zero file-handling security risk. The only actionable recommendation is to either remove the unused `avatar_url` column from `user_profiles` or document the security requirements that must be satisfied before implementing avatar uploads.
