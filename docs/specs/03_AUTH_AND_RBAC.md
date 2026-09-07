# Auth And RBAC

## Goal

Use Keycloak for identity and session security, while keeping all product permissions and clinic access decisions inside Nkwapa.

---

## Current Model

### Keycloak Responsibilities

- login and browser session management
- password hashing and reset-token handling
- token issuance
- brute-force protection
- email verification and password policy

### Nkwapa Responsibilities

- local `User` creation and hydration
- local `UserClinicRole` storage
- permission computation
- clinic membership enforcement
- patient onboarding and claim-record flow

In practice:

- Keycloak proves who the user is
- Nkwapa decides what the user can do and where they can do it

---

## Roles

| Role           | Scope                   | Notes                                                 |
| -------------- | ----------------------- | ----------------------------------------------------- |
| `SYSTEM_ADMIN` | global                  | `clinicId = null`; can bypass clinic restrictions     |
| `DIRECTOR`     | clinic                  | oversight, research approval, clinic admin            |
| `MANAGER`      | clinic                  | clinic operations and roster/lifecycle actions        |
| `DOCTOR`       | clinic                  | clinical review, finalization, prescribing, reminders |
| `VOLUNTEER`    | clinic                  | intake, screening, consent, assignments               |
| `PATIENT`      | clinic-linked self role | portal self-service flows                             |

---

## Permission Model

Permissions are computed from local role mappings in:

- `apps/api/src/auth/constants/permissions.ts`

Current permission families include:

- patient create/read/update/search
- encounter create/read/review/finalize
- screening and care plan actions
- consent recording
- prescription and drug access
- medical-history read and write access
- research settings and export actions
- reminder actions
- clinic management
- ops shifts/check-ins/assignments
- audit reads
- sync push/pull
- dashboard reads
- patient portal self and staff-linked reads/actions
- suspected duplicate review

Realm roles in Keycloak are descriptive, not the authoritative enforcement layer.

Medical history has a narrower clinical write boundary:

- `MEDICAL_HISTORY.READ`: system administrator, director, manager, doctor, and volunteer
- `MEDICAL_HISTORY.WRITE`: doctor and volunteer
- system administrators retain wildcard authority

Every route also requires existing clinic scope. Patient portal roles receive neither permission in
this version.

Screening reads follow the same read-back principle:

- `SCREENING.WRITE`: doctor and volunteer
- `SCREENING.READ`: director, manager, doctor, and volunteer

A volunteer previously held `SCREENING.WRITE` without `SCREENING.READ`, so they could record a
diabetes screening and then not see it. Any role allowed to record a clinical value is allowed to
read that value back.

Duplicate review separates looking from acting:

- `PATIENT.DUPLICATE.REVIEW`: system administrator, director, and manager
- `PATIENT.MERGE`: system administrator only, and only through the wildcard

The split is deliberate. Clinic administrators are the people who recognise the patients, so they
triage the queue and record what they found; consolidating two records is irreversible and stays
with the narrower role. Doctors and volunteers hold neither permission: the queue compares two
charts side by side, which is a wider identity view than a clinical seat needs.

`PATIENT.MERGE` is granted to no role in `ROLE_PERMISSIONS`. `SYSTEM_ADMIN` holds it through its
`*` wildcard and nobody else can be given it, so adding it to a role's list would read as the
policy change it is rather than as a refactor. It covers both the read-only preview and the merge
itself. Before it existed, both sat behind `AdminController`'s class-level `CLINIC_MANAGE`, which a
director and a manager both hold: they reached the service and were refused there. The refusal is
now at the guard, and `PatientMergeService` still asserts the seat independently, because a
boundary that depends on one layer is one refactor from not being a boundary.

The chart-scoped preview at `GET /clinics/:clinicId/patients/:patientId/merge-preview` is scoped
through `ClinicScopeGuard` as well. `PatientMergeRecord`, written by every executed merge, carries a
non-null `clinicId` -- unlike `PatientDuplicateReview`, because merging cannot span two clinics --
and its row level security policy is the ordinary `app.can_access_clinic` one, so clinic staff can
read what was done to their own charts while only a system administrator can cause it.

Scope follows the same rule as the staff roster. `GET /clinics/:clinicId/patients/duplicates` is
clinic-scoped through `ClinicScopeGuard`; `GET /admin/patients/duplicates` covers every visible
clinic and is refused to anyone who is not a system administrator, both by the service and,
independently, by row level security. A review decision about a pair spanning two clinics is stored
with a null `clinicId`, which the `PatientDuplicateReview` policy reads as system administrators
only.

---

## Zone Model

`Clinic.zoneCode` is a reporting and operations dimension. It is **not** a permission scope.

The rule, which decides every surface:

> Zone is a filter wherever a view spans more than one clinic, and context wherever a view is one
> clinic. It is never a grant.

| Surface                     | Spans        | Zone treatment                     |
| --------------------------- | ------------ | ---------------------------------- |
| `GET /admin/clinics`        | many clinics | `?zoneCode=` filter                |
| `GET /admin/clinics/zones`  | many clinics | the filter's vocabulary            |
| Dashboard network overview  | many clinics | `?zoneCode=` filter, plus rollup   |
| Staff roster, all users     | many clinics | client-side filter over the roster |
| Staff roster, active clinic | one clinic   | context only                       |
| `GET /clinics/:id/audit`    | one clinic   | context only                       |

A zone code is tenant-defined free text, shaped like a location code and validated by
`packages/db/src/clinic-metadata.ts`. There is no zone table, no zone enum, and no zone column on
`UserClinicRole`. Two clinics in different organizations may hold the same zone code, and that is
expected rather than a conflict: a zone names a way of grouping clinics, not a boundary.

### Why a filter and not a scope

A zone-scoped role would have to widen access, because that is what a scope does. Zone codes are
free text that any clinic administrator can set, so a zone that granted access would let whoever
edits a clinic's metadata pull that clinic into the reach of everyone in the zone they typed.
Making zone a filter first means the field earns a product meaning without that being possible.

### How a filter is kept from becoming a grant

Three layers, because a boundary that depends on one layer is one refactor from not being a
boundary.

1. **Ordering, in the service.** `ClinicService.clinicScopeForAdmin` resolves which clinics the
   actor may administer, and the zone clause is applied on top of that result. `zoneFilterWhere`
   in `packages/db/src/clinic-zones.ts` can only ever produce a `zoneCode` constraint, so no
   branch exists in which a zone reaches the authorization decision.
2. **A cross-tenant test.** `apps/api/src/auth/zone-scope.spec.ts` runs against a fixture where
   clinics in two different organizations share a zone code, and asserts that filtering by it
   still queries only the actor's own clinic ids, and that the composed `where` contains no `OR`.
3. **A database invariant.** `packages/db/src/rls-coverage.spec.ts` asserts that no row level
   security policy references `app.current_zone_code()` or a zone column, and that
   `UserClinicRole` carries no zone field.

`app.current_zone_code()` exists and the RLS context sets it from the active clinic. It is
diagnostic context, read by no policy. Wiring it into one is a deliberate change to the permission
model, and the invariant test above is what makes that a decision rather than an accident.

The zone list is scoped like the clinic list it filters. The set of zone names describes how a
tenant is organized, so a director learns the zones of the clinics they direct and nothing about
anyone else's.

---

## Enforcement Path

### API Layer

- `JwtAuthGuard` verifies the bearer token
- the request user is hydrated locally
- `ClinicScopeGuard` validates access to the target clinic
- `RbacGuard` checks required permissions
- route decorators express policy:
  - `@RequirePermission(...)`
  - `@ClinicScoped(...)`

### Database Layer

For HTTP traffic, Prisma opens a transaction-scoped RLS context with:

- current request ID
- current user ID
- current organization ID
- allowed clinic IDs
- active clinic ID
- zone code, as diagnostic context that no policy reads
- system-admin bypass flag

This means route guards and Postgres policies reinforce each other.

---

## Bootstrap Contract

`GET /auth/whoami` is the main frontend bootstrap endpoint.

It returns:

- user identity
- clinic memberships, each with the clinic's zone code
- global roles
- active clinic
- effective roles for the active clinic
- effective permissions for the active clinic
- onboarding state for patients who still need to claim a record

A clinic's zone rides along so a single-clinic view can name the zone it is showing. It appears
beside a clinic and nowhere else: never in effective roles, never in effective permissions.

Frontend navigation and clinic switching are driven from this response.

---

## Patient Access And Onboarding

### Staff and Admin Users

1. Create the identity in Keycloak.
2. Let the user log into Nkwapa once.
3. Assign local roles in Nkwapa.

### Patient Users

Current supported model:

1. Create a Keycloak identity.
2. Let the identity log into Nkwapa once so the local `User` exists.
3. Use the patient chart portal-link or portal-invite flow from staff/admin UI.
4. If an invite is pending, `/auth/whoami` returns onboarding state and the user is routed to `/claim-record`.

---

## Keycloak Security Defaults

The current realm export is hardened with:

- brute-force protection enabled
- password policy requiring length, upper, lower, digits, special chars, and history
- 5 minute access tokens
- 30 minute SSO idle timeout
- 10 hour SSO max lifespan
- 15 minute reset-credentials action token lifespan
- 24 hour verify-email action token lifespan
- exact web origin and redirect URI allowlists for local, staging, and production frontends

---

## Current Gaps

- zone is a reporting filter rather than a permission scope; zone-scoped roles are deliberately
  not implemented, and the Zone Model section above is the statement of record
- organization-level admin/reporting permissions are not yet distinct from clinic-level permissions
- Keycloak still provides identity only; app-side policy remains the authority and must continue to be tested independently
