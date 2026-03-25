# Database Setup -- Supabase

Nkwapa uses PostgreSQL via Supabase for staging and production environments.

## Prerequisites

1. Create a [Supabase](https://supabase.com) account (free tier: 500MB, 2 projects).
2. Create two projects: **nkwapa-staging** and **nkwapa-production**.

## Connection Strings

Each Supabase project provides two connection strings (Settings > Database):

| Type | Use for | Format |
|------|---------|--------|
| **Direct** (`port 5432`) | Migrations (`prisma migrate deploy`) | `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres` |
| **Pooled** (`port 6543`) | Runtime API queries | `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` |

## Environment Variables

### GitHub Actions Secrets

Set these in GitHub repo Settings > Environments:

**`preview` environment** (used by `release/dev`):

```
DATABASE_URL=<staging direct connection string>
```

**`production` environment** (used by `main`):

```
DATABASE_URL=<production direct connection string>
```

### Railway Environment Variables

In your Railway service settings, set:

```
DATABASE_URL=<pooled connection string for the matching environment>
```

The pooled connection is recommended for the running API to handle concurrent connections efficiently.

### Local Development

Local development continues to use the Docker Compose PostgreSQL instance:

```
DATABASE_URL=postgresql://nkwapa:nkwapa@localhost:5433/nkwapa
```

## Running Migrations

**Locally:**

```bash
npm run db:migrate:dev
```

**Staging / Production (via CI):**

Migrations run automatically in the deploy workflow using the direct connection string:

```bash
npm run db:migrate:deploy
```

**Manual migration against a remote database:**

```bash
DATABASE_URL="<direct connection string>" npm run db:migrate:deploy
```

## Prisma Adapter

The API uses `@prisma/adapter-pg` for connection management. This works with both direct and pooled Supabase connections. The `PrismaService` in `apps/api/src/prisma/prisma.service.ts` reads `DATABASE_URL` at startup.

## Backups

Supabase free tier includes daily backups with 7-day retention. For production, consider upgrading to the Pro plan for point-in-time recovery.

## Troubleshooting

- **Connection timeout on pooled connection:** Ensure you're using port `6543` and include `?pgbouncer=true` in the connection string.
- **Migration fails:** Use the **direct** connection (port `5432`), not the pooled one. Prisma migrations require a direct connection.
- **SSL errors:** Supabase requires SSL. The default `@prisma/adapter-pg` handles this automatically.
