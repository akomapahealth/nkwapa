# Nkwapa EMR

Multi-clinic EMR for Hypertension and Diabetes workflows. Offline-first PWA with sync, RBAC, and audit-by-default.

## Local Development (Docker-first)

### Prerequisites

- Node.js 20+
- Docker and Docker Compose

### Setup

```bash
# 1. Copy env and start services
cp .env.example .env
docker compose -f infra/nkwapa/docker-compose.yml up -d

# 2. Wait for Postgres/Keycloak (Keycloak may take 30–60s)
# Check: curl http://localhost:8080/health/ready

# 3. Run migrations
npm run db:migrate:dev -- --name init

# 4. Optional: seed demo clinic and system admin
# Add SEED_SYSTEM_ADMIN_SUB to .env (Keycloak user sub) to create SYSTEM_ADMIN
# Obtain sub: login as user, decode JWT at jwt.io, or Keycloak Admin → Users → ID
npm run db:seed

# 5. Start API and Web
npm run dev --workspace=@nkwapa/api
npm run dev --workspace=@nkwapa/web
```

- API: http://localhost:4000
- Web: http://localhost:3000
- Keycloak: http://localhost:8080 (admin/admin)
- Postgres: localhost:5433 (avoids conflict with existing Postgres on 5432)

### Vertical Slice: Verify Login Token

1. Get a token from Keycloak:

```bash
curl -X POST http://localhost:8080/realms/nkwapa/protocol/openid-connect/token \
  -d "grant_type=password" \
  -d "client_id=nkwapa-web" \
  -d "username=testuser" \
  -d "password=testuser"
```

2. Call health (public): `GET http://localhost:4000/health` → `{ "status": "ok" }`
3. Call auth/me (protected): `GET http://localhost:4000/auth/me` with `Authorization: Bearer <access_token>`

## Monorepo Structure

- `apps/api` – NestJS API (auth, health, RBAC)
- `apps/web` – Next.js PWA
- `packages/db` – Prisma schema, migrations, seed

## Auth and RBAC

- **JWT**: Verified via Keycloak JWKS (`KEYCLOAK_JWKS_URI`).
- **Auto-provision**: On first login, User is created from Keycloak `sub`.
- **RBAC**: `@RequirePermission()` and `RbacGuard` enforce role permissions.
- **Clinic scoping**: `@ClinicScoped()` and `ClinicScopeGuard` ensure user has access to the target clinic.
- **Protected endpoints**: `GET /auth/me`, `GET /clinics/:id`, `GET /patients/:id`, `POST /patients`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate:dev` | Run migrations (dev, creates migration files) |
| `npm run db:migrate:deploy` | Apply migrations (CI/production) |
| `npm run db:seed` | Seed demo clinic + optional system admin (`SEED_SYSTEM_ADMIN_SUB`) |

## CI

GitHub Actions runs on PR/push to `main`: lint, typecheck, test, build, and `prisma migrate deploy` against a Postgres service.
