# Security Audit - 2026-04-04

## Scope

- `apps/api` NestJS backend
- `apps/web` Next.js frontend
- `packages/db` Prisma/PostgreSQL data model
- `infra/nkwapa/keycloak` realm export and login theme

## Baseline

- `npm run typecheck` passed before the final verification pass for this hardening rollout.
- `npm run lint` previously passed with two pre-existing React Hook warnings in `apps/web/app/claim-record/page.tsx`.
- Tests previously passed except `apps/api/src/sync/sync.controller.spec.ts`, which depended on a sandbox-restricted listener bind through `supertest`.

## Findings Addressed

### Backend request boundary hardening

- Upgraded the global Nest `ValidationPipe` to use transform, whitelist, and forbid-non-whitelisted settings.
- Converted stringly typed params, queries, and payloads into class-validator DTOs across key clinic, patient, encounter, research, portal, and sync routes.
- Added shared normalization helpers for free-text, email, cursor, boolean, and numeric input.
- Standardized API failures behind an error envelope with `code`, `message`, `requestId`, `retryable`, `fieldErrors`, and `recoveryAction`.

### API transport security

- Replaced permissive single-origin handling with explicit `CORS_ALLOWED_ORIGINS` parsing and exact-origin credential checks.
- Added security headers middleware and removed the default `x-powered-by` header where the adapter supports it.
- Added Redis-backed rate limiting for auth bootstrap, sync, patient claim, portal writes, and external reminder webhook entry points.

### Database tenancy and scale readiness

- Added `Organization` plus `Clinic.organizationId`, `Clinic.timezone`, `Clinic.locationCode`, and `Clinic.zoneCode`.
- Added a request-scoped Prisma RLS context that sets transaction-local Postgres settings for user, organization, active clinic, allowed clinics, zone, and system-admin bypass.
- Added a migration with:
  - organization backfill
  - scale indexes for clinic filtering and keyset-style lookups
  - trigram indexes for patient and user search
  - row-level security policies for clinic-scoped data and patient-linked tables

### Frontend resilience

- Added app-router `loading.tsx`, `error.tsx`, `global-error.tsx`, and `not-found.tsx`.
- Added shared loading, error, retry, and full-screen recovery state components.
- Replaced plain loading and redirect text in auth bootstrap, route guards, and root redirects with branded recovery states.
- Improved bootstrap fetching to preserve existing data during refresh failures instead of blanking the app.

### Keycloak hardening

- Enabled brute-force protection and added password policy expectations in the versioned realm export.
- Kept access token TTL at 5 minutes, SSO idle timeout at 30 minutes, and SSO max lifespan at 10 hours.
- Added explicit reset-credential and verify-email action token lifespan settings in the realm export.
- Replaced localhost-only client redirect and web-origin allowlists with explicit local, staging, and production allowlists.
- Updated the login theme to a wider two-column layout with branded artwork, larger input fields, and consistent recovery-page styling.

## Residual Risks / Follow-up

- Exact staging and production frontend domains in the Keycloak export are currently assumed to be `https://staging.nkwapa.app` and `https://app.nkwapa.app`; update these if your real domains differ.
- RLS protection depends on the app using the request-scoped Prisma context for HTTP traffic. Background jobs and standalone scripts still rely on owner-level access unless they explicitly opt into the same context.
- Full end-to-end validation of Keycloak action token overrides should be confirmed in a running Keycloak environment after import.
