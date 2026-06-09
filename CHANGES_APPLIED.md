# Changes applied

## Build/type fixes

- Added `HttpError` to `lib/auth.ts` and changed unauthorised auth failures to use it.
- Implemented `handleRouteError` in `lib/api.ts`.
- Added `azure-invoice` to the invoice parser extraction method type.
- Removed the invalid empty `app/api/settings/page.tsx` file.
- Added an `npm run typecheck` script.
- Marked the landing page as dynamic to avoid build-time auth/session assumptions.

## Security and production hardening

- Removed `.env.local` from this cleaned project copy.
- Added `.env.example` with placeholders only.
- Added server-side PDF upload validation in `lib/upload-limits.ts`.
- Enforced a 10 MB invoice PDF upload limit on both invoice upload endpoints.
- Added `SECURITY.md`.
- Added `LAUNCH_CHECKLIST.md`.

## Database/Supabase readiness

- Added `supabase/migrations/20260508130000_initial_saas_schema.sql` with core tables, indexes, RLS policies, private storage bucket setup, and storage object policies.

## Verification performed

- `npm run typecheck` passes.
- `npm run build` compiled and completed TypeScript, but hung in this container while Next.js was collecting page data. This should be re-run locally or in CI with production environment variables configured.

## Still required before sale

- Rotate all secrets that were previously present in `.env.local`.
- Run and verify the Supabase migration in a clean project.
- Test RLS/storage isolation using at least two companies and two users.
- Complete Stripe lifecycle tests.
- Add malware scanning/page-count limits for PDFs.
- Add Terms, Privacy, GDPR/data deletion, production monitoring, and support/admin tooling.
