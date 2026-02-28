⸻

/docs/specs/00_INDEX.md

Purpose

This index defines the authoritative implementation order for Nkwapa EMR v1, the dependency graph, and “definition of done” for each spec. Implementation must be sequential by spec dependency, but agents can run in parallel where indicated.

v1 Scope

v1 clinical scope is Hypertension + Diabetes workflows only.

Non-negotiables
	•	Multi-clinic RBAC with clinic scoping on every record
	•	Offline-first PWA with sync
	•	Audit logs for every write (create/update/approve/export)
	•	Consent required for research usage
	•	Director approvals are per-clinic for research export
	•	System-generated patient ID (human-friendly), globally unique
	•	National ID stored securely (encrypted + hashed for dedup)
	•	Docker-first local dev environment
	•	CI pipeline required (tests + lint + build + migrations validation)

Specs and Dependencies

Phase 0 — Foundation
	1.	01_ARCHITECTURE_OVERVIEW.md
Depends on: none
	2.	18_CI_CD_RELEASE_AND_RUNBOOKS.md (later can be partial early)
Depends on: 01

Phase 1 — Data model + Auth/RBAC
	3.	02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md
Depends on: 01
	4.	03_AUTH_AND_RBAC.md
Depends on: 01, 02

Phase 2 — Offline-first
	5.	04_OFFLINE_FIRST_AND_SYNC.md
Depends on: 01, 02, 03

Phase 3 — Core v1 Modules
	6.	06_PATIENTS_MODULE.md
Depends on: 02, 03, 04
	7.	CONSENT_AND_RESEARCH_GATING_V1.md
Depends on: 02, 03, 04, 06
	8.	HTN_DIABETES_WORKFLOWS_V1.md
Depends on: 02, 03, 04, 06
	9.	NOTIFICATIONS_SMS_EMAIL_V1.md
Depends on: 02, 03, 06, 08

Phase 4 — Research export (de-identified)
	10.	14_DEIDENTIFICATION_AND_RESEARCH_PIPELINE.md
Depends on: Consent spec + Domain model + Offline + RBAC

Parallelization Guidance (Agents)
	•	Agent A (Infra): Phase 0 + Docker + CI can start immediately.
	•	Agent B (Auth/RBAC): start after 02 is drafted/merged.
	•	Agent C (Offline/Sync): start after 03 is merged.
	•	Agent D (Patients): start after 04 scaffolding is merged.
	•	Agent E (Consent/Research gating): start after Patients basic endpoints exist.
	•	Agent F (HTN/DM workflows): start after Patients exists (needs patient_id).
	•	Agent G (Notifications): start after workflows define reminder events.

Definition of Done (DoD) Checklist (for every spec)
	•	✅ Prisma schema updated + migrations created and applied via Docker Postgres
	•	✅ API endpoints implemented with RBAC + clinic scoping
	•	✅ OpenAPI updated (generated or maintained) + contract types updated
	•	✅ Unit tests for business logic + integration tests for critical endpoints
	•	✅ Frontend UI flows implemented (if spec includes UI)
	•	✅ Offline support verified for any create/update flows listed
	•	✅ Audit logs produced for all writes
	•	✅ Local run instructions updated (if needed)


⸻

Agent prompts (Prisma-aware)

Agent A — Infra + Prisma bootstrap

Implement monorepo + docker-first local dev:
- apps/api (NestJS), apps/web (Next.js)
- packages/db with Prisma schema + migrations
- docker compose: postgres, redis, keycloak
- prisma migrate workflow (dev) + seed script
- GitHub Actions: lint/test/build + prisma migrate deploy dry-run
Deliver a vertical slice: login token accepted by api + /health endpoint.

Agent DB — Prisma domain model

Implement /docs/specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md using Prisma:
- Create Prisma schema models with relations, indexes, and enums.
- Add migrations and seed scripts.
- Add encryption helpers for national_id_ciphertext and hashing for national_id_hash.
- Add basic repositories/services for Patient + Encounter.

Agent B — Auth/RBAC

Implement /docs/specs/03_AUTH_AND_RBAC.md:
- Keycloak local realm setup and export.
- NestJS JWT verification via JWKS.
- RBAC guard + clinic scoping guard.
- Auto-provision User on first login (keycloak sub).
- Add integration tests for protected endpoints.

Agent C — Offline sync

Implement /docs/specs/04_OFFLINE_FIRST_AND_SYNC.md:
- Frontend Dexie schema and outbox.
- Backend /sync/push and /sync/pull with idempotency keys.
- Conflict handling for patient national_id_hash collisions.
- Add basic UI for sync status + manual sync.


