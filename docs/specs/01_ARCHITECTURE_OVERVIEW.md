⸻

/docs/specs/01_ARCHITECTURE_OVERVIEW.md

Goals

Define a scalable, maintainable architecture that supports:
	•	multi-clinic operations
	•	offline-first capture and sync
	•	strict auditability
	•	future integrations (labs, insurance, partners)
	•	research pipeline with de-identification, consent, and approvals

Repos + Services

Monorepo (recommended via pnpm workspaces or turborepo)

/apps
  /web        Next.js (PWA) + TS
  /api        NestJS + TS
/packages
  /contracts  Shared Zod schemas, DTOs, OpenAPI types
  /db         Prisma schema + migrations + seed scripts
/infra
  /docker     docker-compose, local config, scripts
/docs
  /specs      agent-executable specs
  /runbooks

Runtime Architecture
	•	Web app runs as PWA:
	•	IndexedDB local storage
	•	Service worker caching
	•	Outbox-based sync engine
	•	API runs as NestJS:
	•	REST endpoints
	•	Auth via Keycloak (OIDC)
	•	RBAC guards + clinic scoping middleware
	•	Audit event emission on every write
	•	Data:
	•	Postgres as source-of-truth
	•	Redis for rate limiting + job queues

Key Design Principles
	1.	Clinic scoping everywhere
Every entity that is clinic-specific has clinic_id. Directors can span clinics; managers/doctors are restricted.
	2.	Audit by default
Every mutation emits an audit event with:

	•	who, when, clinic, entity, action, before/after delta, request_id

	3.	Offline-first compatible APIs
Write APIs accept idempotency keys and support sync semantics.
	4.	Incremental extensibility
v1 focuses on HTN/DM; future modules reuse the encounter and workflow skeleton.

Environments
	•	local: docker compose, dev configs
	•	staging: same compose (or k8s later)
	•	production: containerized, secrets in env

Local Docker Services (minimum)
	•	postgres
	•	redis
	•	keycloak
	•	(optional now) minio, grafana stack
