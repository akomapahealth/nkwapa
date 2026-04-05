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

| Role           | Scope                   | Notes                                             |
| -------------- | ----------------------- | ------------------------------------------------- |
| `SYSTEM_ADMIN` | global                  | `clinicId = null`; can bypass clinic restrictions |
| `DIRECTOR`     | clinic                  | oversight, research approval, clinic admin        |
| `MANAGER`      | clinic                  | clinic operations and roster/lifecycle actions    |
| `DOCTOR`       | clinic                  | finalize encounters, prescribe, reminders         |
| `PRECEPTOR`    | clinic                  | review and screening oversight                    |
| `VOLUNTEER`    | clinic                  | intake, screening, consent, assignments           |
| `PATIENT`      | clinic-linked self role | portal self-service flows                         |

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
- research settings and export actions
- reminder actions
- clinic management
- ops shifts/check-ins/assignments
- audit reads
- sync push/pull
- dashboard reads
- patient portal self and staff-linked reads/actions

Realm roles in Keycloak are descriptive, not the authoritative enforcement layer.

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
- zone code
- system-admin bypass flag

This means route guards and Postgres policies reinforce each other.

---

## Bootstrap Contract

`GET /auth/whoami` is the main frontend bootstrap endpoint.

It returns:

- user identity
- clinic memberships
- global roles
- active clinic
- effective roles for the active clinic
- effective permissions for the active clinic
- onboarding state for patients who still need to claim a record

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

- zone-scoped RBAC is not yet implemented
- organization-level admin/reporting permissions are not yet distinct from clinic-level permissions
- Keycloak still provides identity only; app-side policy remains the authority and must continue to be tested independently
