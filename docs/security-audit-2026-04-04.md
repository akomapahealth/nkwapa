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

## Follow-up Hardening - 2026-05-28

### Scope reviewed

- API request handlers, guards, chat REST and WebSocket flows, reminder jobs, research export jobs, and Prisma RLS context handling.
- Prisma raw SQL usage and dynamic query construction.
- Web auth bootstrap assumptions, Keycloak token validation, CORS, headers, cookies/session handling, and Socket.IO authentication.
- Dependency advisories, secret scanning, operational logs, provider failures, and persisted sync/reminder failure payloads.

### Mitigations added

- Encounter-by-id permission checks now evaluate access against the resolved encounter clinic, preventing a role from another clinic from satisfying a clinic-scoped permission check.
- Chat reads, sends, typing notifications, mark-read operations, room joins, and participant notifications now verify the conversation belongs to the authenticated clinic before exposing or mutating state.
- Socket.IO authentication now rejects missing, malformed, non-scalar, or unauthorized `clinicId` values; optional `KEYCLOAK_AUDIENCE` enforcement is applied when configured; client-facing auth and message errors are generic.
- RLS is now enabled for `Conversation`, `ConversationParticipant`, and `Message`, with policies tied to the app-managed tenant context.
- Background reminder and research export jobs now enqueue `clinicId` and execute inside `PrismaService.withClinicContext`. Legacy queued jobs without `clinicId` first resolve their tenant from the database and only use explicit system context when no tenant can be resolved.
- Operational logging now uses centralized URL/error redaction, avoids raw query strings and exception traces in request/rate-limit logs, and avoids provider response bodies or PHI-bearing reminder/research failure details in persisted records.
- Dependency remediation upgraded Nest, Prisma, Sentry, BullMQ, Socket.IO, Next, ESLint, and related transitive packages. Runtime dependencies are audited at moderate severity or higher, and the full dependency graph is audited at critical severity.
- The repository now uses ESLint flat config for ESLint 9 / Next 16 compatibility while preserving the prior lint baseline.

### Raw SQL and injection review

- Prisma raw SQL paths remain limited to tagged `$queryRaw` / `$executeRaw` calls or static migration SQL.
- No reviewed dynamic raw SQL path accepts unsanitized user input. Tenant-context helpers write RLS settings through parameterized Prisma calls.

### Job context model

- Normal job path: enqueue payload includes `clinicId`; processor wraps work in `withClinicContext(clinicId, ...)`.
- Legacy job path: processor resolves `clinicId` from the reminder/export record, then uses tenant context.
- Documented system fallback: only used for legacy payloads whose backing record no longer resolves to a clinic. These paths are logged as explicit system-context execution and should trend to zero as old queues drain.

### Verification results

- `npm run security:scan`: passed, `Secret scan passed for 489 tracked/untracked files.`
- `npm run security:audit`: passed. Runtime dependencies reported zero vulnerabilities at moderate severity or higher, and the full dependency graph reported no critical vulnerabilities.
- `npm run lint --workspaces --if-present`: passed.
- `npm run typecheck --workspaces --if-present`: passed.
- `npm run test --workspaces --if-present`: passed, 36 suites / 157 tests. Jest reported a pre-existing open-handle warning after the API suite completed.
- `npm run build --workspaces --if-present`: passed when run outside the local sandbox. The sandboxed run failed because Next 16 Turbopack attempted to spawn/bind a worker process during CSS processing and received `Operation not permitted`.
- Docker-backed E2E smoke:
  - `docker compose -f infra/nkwapa/docker-compose.yml up -d postgres redis keycloak`: passed.
  - `DATABASE_URL=postgresql://nkwapa:nkwapa@localhost:5433/nkwapa npm run db:migrate:deploy`: passed.
  - `npm run e2e:keycloak-user`: passed after allowing local Keycloak access.
  - `npm run db:seed`: passed after allowing local Postgres access.
  - `npx playwright install chromium`: installed the upgraded Playwright Chromium runtime.
  - `npm run e2e --workspace=@nkwapa/web`: passed, 9 tests.

### Dependency refresh - 2026-07-30

- Upgraded NestJS to `11.1.28`, Prisma to `7.9.1`, Sentry for Next.js to `10.69.0`,
  TypeScript ESLint to `8.65.0`, PostCSS to `8.5.25`, Sharp to `0.35.3`, and Next.js to
  `16.3.0-canary.104`.
- Regenerated the workspace lockfile and verified it with a clean `npm ci`.
- Added `npm run security:audit` as the shared local and CI dependency policy:
  - production dependencies block at moderate severity or higher
  - the complete dependency graph blocks at critical severity
- Rejected `npm audit fix --force` because its proposed ESLint, Next ESLint config, Nest CLI,
  Jest, and ts-jest changes were breaking or mutually incompatible and did not safely eliminate
  the underlying development-only advisory.
- Verification passed:
  - Prettier formatting
  - ESLint
  - TypeScript typechecking
  - secret scanning across 516 files
  - 44 unit suites / 244 tests
  - production API, web, and database builds
  - Docker-backed Playwright, 10 tests across authentication, recovery, public routes, workspace
    behavior, and responsive phone/tablet/laptop/desktop layouts

### Residual risks

- Next is pinned to `16.3.0-canary.104` because the latest stable `16.2.12` still declares
  vulnerable `postcss@8.4.31` and `sharp@^0.34.5`. Track the next stable Next release that carries
  patched PostCSS and Sharp versions, then move off canary.
- The full development dependency graph still reports the high-severity `brace-expansion`
  denial-of-service advisory through legacy `minimatch@3` consumers in ESLint, Jest, the Nest CLI,
  and their plugins. These packages do not ship in the production runtime. Forcing
  `brace-expansion@5` breaks the CommonJS API expected by `minimatch@3`, while npm's forced
  remediation proposes incompatible downgrades of core tooling. CI therefore blocks moderate-or-
  higher runtime advisories and critical advisories anywhere in the graph. Remove this exception
  when the upstream tools support a patched `brace-expansion` release.
- Legacy background jobs without `clinicId` remain supported for queue drain compatibility. Monitor logs for system-context fallback and treat any recurring fallback as a data repair task.
- RLS remains app-context driven. Production database role separation and forced RLS ownership controls should be reviewed separately before relying on RLS as the only tenant isolation layer.
- E2E coverage depends on Docker-backed Postgres, Redis, Keycloak, and the matching Playwright browser runtime being available in the execution environment.
