<p align="center">
  <img src="apps/web/public/images/nkwapa-logo.png" alt="Nkwapa" width="320">
</p>

# Nkwapa

Nkwapa is the electronic medical record and clinic workflow system for
[Akomapa Health](https://akomapa.org)'s community clinics and screening days in Ghana. It focuses
on hypertension, diabetes and non-communicable disease screening. Registration, station
measurements, clinical encounters, doctor review and follow-up all land in one patient record, so
the doctor sees what every station recorded and the next visit starts from the patient's history.

It is built for the screening day as it really runs: patients walk between stations on shared
clinic laptops, and the clinic Wi-Fi drops. Work recorded offline waits in an outbox and syncs
when the connection returns.

## Who uses it

| Role                  | What they do in Nkwapa                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Volunteers and nurses | Register patients and record vitals, glucose, body measurements, eye checks and counselling at stations |
| Doctors               | Review encounters, finalize visits, sign and cosign hypertension action plan notes, set follow-up       |
| Managers              | Run the day: the station line, check-in, assignments, queues, shifts and volunteer rosters              |
| Directors             | Oversee a clinic: activity, screening coverage, follow-up, audit, research exports                      |
| System administrators | Work across clinics: clinics, staff and roles, duplicate patients, organization reporting               |
| Patients              | Use the portal on their phones: appointments, their own readings and self-reports                       |

One person can hold several roles at one clinic and different roles at different clinics. Every
action is scoped to the clinic in use and checked against the person's permissions.

## What it does

- **Station-based screening.** A visit moves through registration, blood pressure, glucose, body
  measurements, eye and counselling stations, with a live board of who is waiting and for how long.
- **Clinical records.** Encounters, guided hypertension and diabetes interviews, medical history,
  medication reconciliation and adherence, prescriptions, and clinical notes with cosign and
  addenda.
- **Patient registry.** Search, registration with or without an ID document, duplicate review and
  merging, and invite-and-claim onboarding to the portal.
- **Appointments and reminders.** Patient requests, staff triage, the full appointment lifecycle,
  and SMS and email reminders through one recorded delivery ledger.
- **Oversight and analytics.** Role-aware dashboards, metrics, staff activity, audit, cohort
  analytics and organization reports.
- **Research exports.** Consent-gated, de-identified datasets with an approval step.
- **Staff messaging.** Direct and group chat within a clinic.
- **Works offline.** An installable web app with an outbox, a sync center and held changes per
  clinic and per account.

## Architecture at a glance

A TypeScript monorepo on npm workspaces.

| Part          | What it is                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`    | Next.js 16 (App Router), React 18, Tailwind 3 and shadcn/ui. Staff workspace, patient portal and public pages; offline store in IndexedDB (Dexie) |
| `apps/api`    | NestJS 11 HTTP API, BullMQ background jobs (reminders, research exports) and a Socket.IO gateway for chat                                         |
| `packages/db` | Prisma 7 schema, migrations, seed and shared domain helpers                                                                                       |
| PostgreSQL    | System of record. Row-level security isolates each clinic's data                                                                                  |
| Redis         | Rate limiting, job queues and chat fan-out                                                                                                        |
| Keycloak      | Sign-in, passwords and sessions, with a Nkwapa login theme. Nkwapa owns roles and permissions                                                     |

Access is enforced in three layers: Keycloak identity, NestJS guards, and Postgres row-level
security. More in the [architecture overview](docs/specs/01_ARCHITECTURE_OVERVIEW.md).

## Getting started

You need Node.js 22 or later with npm 10, and Docker.

```bash
npm install
cd infra/nkwapa && docker compose up -d && cd ../..
npm run db:migrate:dev
npm run e2e:keycloak-user
npm run db:seed:local
npm run dev --workspace=@nkwapa/api
npm run dev --workspace=@nkwapa/web
```

Copy the `.env.example` files first, and set the test account subjects before seeding.
[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md) walks through every step. The web app runs on
`http://localhost:3000`, the API on `:4000` and Keycloak on `:8080`.

## Environments and deploy

| Environment | Branch        | Web                  | API and Keycloak |
| ----------- | ------------- | -------------------- | ---------------- |
| Staging     | `release/dev` | `staging.nkwapa.app` | Render           |
| Production  | `main`        | `nkwapa.app`         | Render           |

A push to either branch runs migrations, deploys web (Vercel), API and auth (Render), verifies the
live deployment, and on `main` tags a release. Work branches from `release/dev`; `release/dev` is
merged into `main` to release. See [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Testing

| Command                                              | What it runs                                        |
| ---------------------------------------------------- | --------------------------------------------------- |
| `npm run lint` / `npm run typecheck`                 | ESLint and TypeScript in every workspace            |
| `npm run test`                                       | Jest unit and integration tests in every workspace  |
| `npm run e2e`                                        | Playwright end-to-end tests against a running stack |
| `npm run design:check-tokens`, `design:check-charts` | Colour contrast for tokens and the chart palette    |
| `npm run security:scan`                              | Secrets and sensitive files                         |

CI runs all of these on every pull request. Manual acceptance checks are in the
[user testing guide](docs/USER_TESTING_GUIDE.md).

## Repository layout

```text
apps/
  api/          NestJS API, workers and chat gateway
  web/          Next.js web app and its Playwright tests
packages/
  db/           Prisma schema, migrations, seed, shared helpers
infra/
  nkwapa/       Docker Compose for local services, Keycloak realm and login theme
  keycloak/     Keycloak image for deployment
deploy/env/     Environment templates for staging and production
scripts/        CI checks, deploy verification, Keycloak and database helpers
docs/           Guides, specs, design system and release notes
```

## Documentation

Start at [docs/README.md](docs/README.md). The design system is
[docs/design-system/MASTER.md](docs/design-system/MASTER.md).

## License

GNU General Public License v3.0. See [LICENSE](LICENSE).
