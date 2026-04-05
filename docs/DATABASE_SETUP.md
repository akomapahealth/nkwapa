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

---

## RLS And Runtime Notes

- clinic-scoped tables are protected by Postgres RLS
- the API uses `PrismaService.withRlsContext(...)` to set transaction-local context per request
- background jobs and standalone scripts do not automatically inherit the same context unless they opt into it explicitly

This means direct SQL access or ad hoc scripts can still bypass the same safety shape as normal HTTP traffic unless they use the same conventions.

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
