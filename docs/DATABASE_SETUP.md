# Database Setup

Nkwapa uses PostgreSQL locally and in hosted environments. The current schema expects PostgreSQL features such as row-level security and text-search extensions used by the Prisma migrations.

---

## Supported Environments

### Local development

Local development uses the Docker Compose Postgres instance in `infra/nkwapa`.

Default connection string:

```bash
DATABASE_URL=postgresql://nkwapa:nkwapa@localhost:5433/nkwapa
```

### Hosted environments

Staging and production can run on Supabase or another managed PostgreSQL provider.

Recommended pattern:

- use a pooled runtime connection for the API
- use a direct connection only when running Prisma migrations

Nkwapa currently reads a single `DATABASE_URL`, so migration commands against hosted environments should temporarily override `DATABASE_URL` with the direct connection string for that command.

---

## Runtime vs Migration Connections

| Connection type | Use for                                              | Notes                                                                           |
| --------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| Pooled          | Running API traffic                                  | Good for app concurrency; compatible with the request-scoped Prisma RLS pattern |
| Direct          | `prisma migrate deploy` and other migration commands | Required for reliable Prisma schema changes on hosted providers                 |

Example remote migration command:

```bash
DATABASE_URL="<direct connection string>" npm run db:migrate:deploy
```

After that, switch the deployed API back to the pooled runtime connection string.

---

## Local Setup Flow

1. Start infra:

```bash
cd infra/nkwapa
docker compose up -d
```

2. From the repo root, sync Prisma and the database:

```bash
npm run db:migrate:dev
npm run db:generate
```

3. Seed the default organization, clinic, and starter data if needed:

```bash
npm run db:seed
```

---

## Seed Inputs

Common seed variables:

- `SEED_ORGANIZATION_NAME`
- `SEED_ORGANIZATION_SLUG`
- `SEED_ORGANIZATION_TIMEZONE`
- `SEED_CLINIC_NAME`
- `SEED_CLINIC_REGION`
- `SEED_CLINIC_COUNTRY`
- `SEED_CLINIC_TIMEZONE`
- `SEED_CLINIC_LOCATION_CODE`
- `SEED_CLINIC_ZONE_CODE`
- `SEED_SYSTEM_ADMIN_SUB`
- `SEED_SYSTEM_ADMIN_NAME`
- `SEED_SAMPLE_PATIENT`

The seed now creates or updates:

- the default organization
- the default clinic/location
- a system admin user when `SEED_SYSTEM_ADMIN_SUB` is provided
- default research settings for that clinic when a seed admin exists
- demo drug catalog
- optional sample patient data

---

## Schema And Client Sync

Use these commands from the repo root:

```bash
npm run db:migrate:dev
npm run db:generate
```

For deploy environments:

```bash
npm run db:migrate:deploy
npm run db:generate
```

Notes:

- `db:migrate:*` updates the actual database schema.
- `db:generate` refreshes the Prisma client used by the API.
- `postinstall` already runs `db:generate`, but rerunning it is safe.

### Note on local Prisma drift migrations

Some migrations in this repo intentionally use raw SQL for performance-oriented indexes such as:

- descending keyset pagination indexes
- trigram search indexes
- partial unique active-state indexes

Because Prisma cannot fully model every raw SQL index detail, `prisma migrate dev` may occasionally propose a local follow-up migration, often with a timestamped `*_dev` name, that only drops and recreates those indexes in a simpler form.

Treat those local drift migrations as disposable until they are validated against a clean database. Do not commit them automatically. First confirm whether they represent a real schema change or only Prisma attempting to normalize intentional raw SQL objects.

---

## RLS And Runtime Notes

- Clinic-scoped tables are protected by Postgres RLS.
- HTTP traffic uses `PrismaService.withRlsContext(...)` to set transaction-local context.
- Queue workers must use `JobTenantContextRunner`; they do not inherit HTTP context.
- Direct database scripts are privileged operations and do not automatically receive tenant context.

### Background job rule

Every newly produced queue payload must carry `clinicId` and an explicit `userId` (`null` for
automated work). Every processor must call one of these runner methods before touching the database:

- `runClinicJob(...)` for clinic data. It applies clinic/user context before the callback runs.
- `runSystemJob(...)` only for work that genuinely spans tenants. A non-empty
  `systemReason` is mandatory and the runner logs the decision without job payload data.

`runClinicJob(...)` also requires an explicit unresolved-tenant policy:

- `discard` is appropriate only when a missing backing record makes the work safely obsolete.
- `fail` raises `UnresolvedJobTenantError` so BullMQ retries and failure monitoring retain the
  integrity signal.

Legacy jobs without tenant metadata may use system context only to resolve their clinic and user.
The actual job callback must then run under clinic context. It must never continue under system
context when resolution fails.

Before adding or changing a processor:

1. Identify whether its data is clinic-scoped, system-scoped, or contains no database access.
2. Put clinic/user identity in every newly produced queue payload.
3. Use the matching runner method and declare the unresolved-tenant policy.
4. Add tests for direct tenant metadata, any legacy resolver, and the failure/discard decision.
5. Confirm warnings contain identifiers and static reasons only, never payload data or PHI.

### Standalone script rule

Do not use a direct `PrismaClient` for routine clinic maintenance. Prefer an authenticated API
operation or a Nest application command that can use `JobTenantContextRunner`. If direct access is
unavoidable, the script must document its tenant-safety decision at the top of the file, accept an
explicit clinic identifier for clinic work, use a least-privilege database credential, and include
reviewed validation and failure behavior.

Current standalone utility audit:

| Path                                        | Database access | Tenant-safety decision                                                                                                                         |
| ------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/check-secrets.mjs`                 | No              | Repository scanner; no tenant decision required                                                                                                |
| `scripts/create-keycloak-e2e-user.mjs`      | No              | Keycloak E2E setup; no clinic data                                                                                                             |
| `scripts/validate-keycloak-realm.mjs`       | No              | Static realm validation; no tenant data                                                                                                        |
| `packages/db/prisma/seed.ts`                | Yes             | Privileged system bootstrap; creates the organization, clinic, initial identities, roles, and seed records before normal tenant context exists |
| `packages/db/prisma/assign-system-admin.ts` | Yes             | Privileged system maintenance; grants a global role and is intentionally not clinic-scoped                                                     |
| `packages/db/prisma/seed-drugs.ts`          | Indirect        | Not standalone; receives an explicit clinic from the privileged bootstrap seed                                                                 |

The two privileged direct-client scripts are exceptions, not templates for future clinic-scoped
scripts. Adding another exception requires a documented system reason and security review.

---

## Environment Variables

Common variables from `.env.example`:

- `DATABASE_URL`
- `REDIS_URL`
- `CORS_ALLOWED_ORIGINS`
- `KEYCLOAK_URL`
- `KEYCLOAK_REALM`
- `KEYCLOAK_CLIENT_ID`
- `PII_ENCRYPTION_KEY_BASE64`
- `NATIONAL_ID_PEPPER`
- `NATIONAL_ID_ENCRYPTION_KEY`

---

## Troubleshooting

- If migrations fail on a hosted database, retry with a direct connection string instead of a pooled one.
- If the API connects but tenant isolation behaves unexpectedly, confirm the request path is using the Prisma request-scoped context.
- If Prisma types look stale after schema changes, run `npm run db:generate`.
- If seed patient creation is skipped, verify `NATIONAL_ID_ENCRYPTION_KEY` is set when `SEED_SAMPLE_PATIENT=true`.
