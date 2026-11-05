# Getting started

Run Nkwapa on your own machine: Postgres, Redis, Keycloak and Mailpit in Docker, with the API and the
web app running from the workspace. This page is the short path. The deeper references are
[DATABASE_SETUP.md](DATABASE_SETUP.md) (connections, seeding, row-level security, clinic metadata)
and [USER_AND_ROLE_SETUP_GUIDE.md](USER_AND_ROLE_SETUP_GUIDE.md) (roles, invites, portal accounts).

## Prerequisites

- Node.js 22 or later, and **npm 10**. The repo uses npm workspaces and `package-lock.json`. A
  lockfile written by npm 11 breaks `npm ci` in CI, so regenerate it with npm 10 if you change
  dependencies.
- Docker with Compose.

## 1. Install and configure

```bash
npm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

The root `.env` is read by Prisma, the seed and the scripts in `scripts/`. The API reads
`apps/api/.env` and the web app reads `apps/web/.env.local`. The templates point at the Docker
services below. Feature flags default to off; turn on the ones you are working on in both the API
(`FEATURE_*`) and the web app (`NEXT_PUBLIC_FEATURE_*`).

## 2. Start the services

```bash
cd infra/nkwapa && docker compose up -d
```

| Service  | Address                                     |
| -------- | ------------------------------------------- |
| Postgres | `localhost:5433`                            |
| Redis    | `localhost:6379`                            |
| Keycloak | `http://localhost:8080` (realm `nkwapa`)    |
| Mailpit  | `http://localhost:8025` (catches all email) |
| API      | `http://localhost:4000` (started in step 4) |
| Web      | `http://localhost:3000` (started in step 4) |

Keycloak imports the realm and the Nkwapa login theme from `infra/nkwapa/keycloak/` on first boot.

## 3. Create the database and test accounts

From the repository root:

```bash
npm run db:migrate:dev
npm run db:generate
node scripts/provision-app-db-role.mjs   # gives the row-level-security role a login
npm run e2e:keycloak-user                # creates the e2e.* identities in Keycloak
npm run db:seed:local                    # organization, clinic, drug catalog, links the identities
```

`e2e:keycloak-user` prints the subject Keycloak actually assigned to each identity. Put those into
the root `.env` as the `SEED_E2E_*_SUB` variables before seeding, or the accounts will exist in
Keycloak with no matching user in the database. Sample flags such as `SEED_SAMPLE_PATIENT` need
the string `true`. The accounts, and what each one is for, are listed in
[USER_TESTING_GUIDE.md](USER_TESTING_GUIDE.md#2-accounts).

## 4. Run the API and the web app

In two terminals:

```bash
npm run dev --workspace=@nkwapa/api
npm run dev --workspace=@nkwapa/web
```

Open `http://localhost:3000` and sign in with one of the `e2e.*` accounts.

## 5. Checks before you push

The same checks CI runs, cheapest first:

```bash
npm run security:scan            # secrets and sensitive files
npm run lint
npm run typecheck
npm run test                     # Jest in every workspace
npm run design:check-tokens      # semantic colour contrast, both themes
npm run design:check-charts      # chart palette
npm run test:scripts             # tests for scripts/
npx prettier --check .
npm run e2e                      # Playwright, needs the services and a build
```

Cap Jest at two workers on a laptop (`-- --maxWorkers=2`); an uncapped run can freeze the
machine. The pre-push hook runs the lint, typecheck and test steps for every workspace.

## When something goes wrong

- **Every staff page says "No clinic selected"** after a full reseed: the Keycloak subjects in
  `.env` no longer match. Run `npm run e2e:keycloak-user` again, update the `SEED_E2E_*_SUB`
  values and reseed. [DATABASE_SETUP.md](DATABASE_SETUP.md#recovering-from-a-subject-mismatch-after-a-reseed)
  has the details.
- **Pages say "We couldn't confirm your access"** during a long manual session: the
  `/auth/whoami` rate limit. Raise `RATE_LIMIT_AUTH_WHOAMI_LIMIT` in `apps/api/.env`.
- **End-to-end specs fail on a second run:** some specs consume their seed fixtures. Start from a
  fresh database. [USER_TESTING_GUIDE.md](USER_TESTING_GUIDE.md#3-what-already-runs-on-every-push)
  covers what CI already proves and how to read a local run.
