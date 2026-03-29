⸻

/docs/specs/03_AUTH_AND_RBAC.md

Goal

Implement authentication via Keycloak and authorization via RBAC + clinic scoping.

Auth approach
	•	Keycloak is the Identity Provider (OIDC).
	•	Frontend obtains access token (JWT).
	•	Backend verifies JWT using Keycloak public keys (JWKS).
	•	Backend maps sub → internal User record (auto-provision on first login).

Roles

SYSTEM_ADMIN, DIRECTOR, MANAGER, DOCTOR, PRECEPTOR, VOLUNTEER

Permission Matrix (v1)

Patients
	•	VOLUNTEER: create patient, create encounter, add vitals/screening (draft)
	•	PRECEPTOR: review/approve screening → set encounter IN_REVIEW
	•	DOCTOR: finalize encounter, create care plan, schedule follow-up reminder
	•	MANAGER: manage clinic staff assignments, view clinic reports
	•	DIRECTOR: manage clinics, approve research exports per clinic, set clinic research settings
	•	SYSTEM_ADMIN: global admin

Consent
	•	VOLUNTEER/PRECEPTOR/DOCTOR: record consent for patient
	•	MANAGER: view consent stats for clinic
	•	DIRECTOR: enforce clinic research policy, export approvals

Enforcement rules

Backend
	•	NestJS Guard AuthGuard verifies JWT.
	•	NestJS Guard RbacGuard checks required permission.
	•	ClinicScopeGuard ensures:
	•	user has access to target clinic_id OR role is SYSTEM_ADMIN OR DIRECTOR with clinic membership.
	•	Every controller uses decorators:
	•	@RequirePermission("PATIENT.CREATE") etc.
	•	@ClinicScoped() for endpoints that require clinic_id

Frontend
	•	Route guards by role.
	•	UI hides actions user cannot perform.

Seed / bootstrap
	•	Provide a seed script that:
	•	creates an initial SYSTEM_ADMIN user by keycloak_sub (env var)
	•	creates a Director and one clinic optionally (dev convenience)
