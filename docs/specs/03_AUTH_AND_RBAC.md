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
- screening, care plan, and supervising-clinician plan actions
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

The supervising clinician's block inside a screening record is narrower still:

- `CAREPLAN.CLINICIAN_PLAN`: doctor only, with `SYSTEM_ADMIN` reaching it through the wildcard

It is deliberately not a reuse of `CAREPLAN.WRITE`, which is also doctor-only and would work
mechanically. That permission names the `CarePlan` record; using it to gate a section of a
screening record would make the generated role matrix describe something that is not true.

One permission governs reading and writing the block together, and it decides three layers: the
route, the sync projection that withholds those columns from every device, and whether the web
renders the section at all. A response omits the block rather than blanking it, because a key
present with a null value tells a reader there is a plan they are not allowed to see.

The same permission gates overriding a derived blood-pressure classification. Those fields sit on
the volunteer-writable payload because they belong to the record rather than to the plan, so
without the check the derivation would be advisory: anyone who could write a screening could assert
whatever classification they liked.

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

## Organization and Zone Isolation

The policy, as the tests in `apps/api/src/tenancy/org-zone-isolation.integration.spec.ts` (#16) hold
it against a real database, as the unprivileged application role:

- **A clinic role sees its clinics' rows and nothing else**, whatever it asks for. A user with roles
  at two clinics sees exactly those two.
- **The active-clinic header chooses; it does not grant.** `X-Clinic-Id` picks which of the actor's
  clinics is active. Naming a clinic the actor has no role at adds nothing to what they can read.
- **Organization and zone are filters, never grants.** Every filter is ANDed onto the actor's own
  scope. A director who names another organization, or a zone another organization also uses, gets
  their own clinics that match, which is often none.
- **Reading and administering are different scopes.** Someone who practises at a clinic may read it,
  but it does not appear among the clinics they administer unless they direct it. Row level security
  enforces the first; the services enforce the second, and the suite includes a user for whom the two
  differ so that neither layer can quietly cover for the other.
- **`SYSTEM_ADMIN`'s global visibility comes from the global seat only** (`clinicId = null`). A
  clinic-scoped row that says `SYSTEM_ADMIN` grants nothing global. The organization report and the
  cross-clinic dashboard comparison are system-admin only.
- **Another tenant's clinic is not confirmed to exist.** A director asking for a clinic outside their
  scope gets "not found", not "forbidden", because row level security hides the row.
- **Scope widening for invitations is per route.** An open staff invitation adds its clinic to the
  invitee's scope only on the routes that show or accept it (`@IncludeStaffInviteScope`), never on
  ordinary requests.

The suite was checked against deliberate regressions: removing the service scope, widening every
route for invitations, letting the header grant its clinic, and dropping the report's admin check
each make it fail.

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
- staff invitations the user can accept (`pendingStaffInvites`), whatever roles they hold
- onboarding state: `PATIENT_CLAIM_REQUIRED` for a patient who still needs to claim a record, or
  `STAFF_INVITE_ACCEPT_REQUIRED` for an account with no role and an open staff invitation. Only an
  account with no role at all is held on an onboarding page; a colleague who already works in one
  clinic is offered an invitation to another, not redirected to it

A clinic's zone rides along so a single-clinic view can name the zone it is showing. It appears
beside a clinic and nowhere else: never in effective roles, never in effective permissions.

Frontend navigation and clinic switching are driven from this response.

---

## Patient Access And Onboarding

### Staff and Admin Users

Managers, doctors and volunteers are invited by email (issue #124). Nobody creates their Keycloak
identity by hand.

1. A DIRECTOR of the clinic, or a SYSTEM_ADMIN, issues a `StaffInvite` from `/admin/users`
   (`POST /clinics/:clinicId/staff-invites`, permission `CLINIC.STAFF.INVITE`).
2. The API provisions the Keycloak identity through the `nkwapa-api` service account, exactly as
   for a patient invitation, and Keycloak emails the password link. The API emails
   `STAFF_INVITE_V1`, which names the clinic, the role and that link's subject.
3. The invitee signs in and accepts on `/accept-invite` (`POST /staff-invites/:id/accept`). The
   role is granted immediately and audited as `ROLE.GRANT` with the invitation it came from.

A staff invitation grants a role over other people's records with possession of the inbox as the
only proof, unlike a patient invitation, which still needs a patient code and a date of birth. So
it carries controls the patient flow does not:

- **Role ceiling.** Only MANAGER, DOCTOR and VOLUNTEER can be invited. A DIRECTOR invites only into
  a clinic they direct; a SYSTEM_ADMIN into any clinic. The service applies this from the actor's
  own role rows, behind `ClinicScopeGuard` and the permission, and the database's
  `StaffInvite_role_check` refuses any other role.
- **Short expiry.** 72 hours by default, at most 7 days. The Keycloak action link inherits it.
- **Shared inboxes refused**, and reuse of an address that already belongs to a staff account
  requires the inviter to confirm.
- **Acceptance is keyed on the verified email.** `User.email` is written only from a token with
  `email_verified`; when Keycloak recorded which identity it provisioned, only that identity may
  accept.
- **Tenant scope is widened only where needed.** The RLS interceptor adds the clinic of an open
  staff invitation only on handlers marked `@IncludeStaffInviteScope()` (whoami, the invitee's
  list, accept). A patient invitation widens every request, which is safe because a patient
  invitee holds no role. A staff invitee often does (a doctor at one clinic invited to another),
  and widening every request would give them scope over the second clinic before accepting.
- One live invitation per address per clinic (`StaffInvite_pending_unique_idx`); reissuing
  cancels the previous one. The hourly invite sweep settles lapsed ones to EXPIRED.

DIRECTOR and SYSTEM_ADMIN seats are still assigned by hand on `/admin/users`, once the person has
signed in and their local `User` row exists.

Removal mirrors it (issue #126). Deactivation sets `User.isActive` in the request, then an
`identity-sync` BullMQ job disables the Keycloak identity (`PUT /users/{id}` with `enabled: false`)
and ends its sessions (`POST /users/{id}/logout`). Reactivation re-enables it. Both calls are within
the service account's `manage-users` ceiling. The job runs after the request commits because the
request is a single bounded transaction, and a slow Keycloak inside it could roll the local block
back. The job converges on the user's current state rather than replaying a command, so a quick
deactivate-then-reactivate lands correctly whichever job runs first. `User.identitySyncStatus`
records the outcome for the admin page. A clinic-scoped deactivation of someone who still works
in another clinic withdraws only that clinic's roles and leaves the identity alone.

### Patient Users

Patients do not create their own accounts, and staff do not create them by hand. The account
is provisioned when the invitation is sent.

1. Staff issue a portal invite from the patient chart, against an email address.
2. Nkwapa creates the Keycloak identity through the `nkwapa-api` service account, and asks
   Keycloak to email the patient an action link for `UPDATE_PASSWORD` and `VERIFY_EMAIL`.
   That action token is the secret: the invite link itself carries none.
3. The patient receives two messages. Nkwapa's invitation carries the clinic, the patient
   code and the expiry; Keycloak's carries the link. Each names the other, so the pair does
   not read as a phishing attempt.
4. The patient sets a password and their email address is confirmed by the same token. They
   sign in once with the password they just chose, because completing an admin-issued action
   token does not itself open a session, and land back on `/claim-record`.
5. `/auth/whoami` returns onboarding state, and the patient confirms their patient code and
   date of birth to link the record. That step is unchanged.

Notes that matter operationally:

- **Registration stays disabled.** `registrationAllowed` is `false` and must remain so; open
  self-registration would let anyone create an account against a clinic. The realm validator
  fails the build if it is flipped.
- **Verification is load-bearing.** `jwt.strategy.ts` writes `User.email` only when Keycloak
  reports the address verified, and invites are matched on that address. An unverified
  identity will never match an invitation, which is why `VERIFY_EMAIL` is always requested.
- **Resending is idempotent.** Provisioning reads Keycloak's own state, so a resend asks only
  for what is still outstanding and never resets a password the patient has already chosen.
- **A Keycloak outage does not block a clinic.** The invitation is still created and sent; the
  chart reports that no account stands behind it, and a resend finishes the job.
- **Two SMTP configurations must both be live.** Keycloak sends through `KC_SMTP_*`, and the
  application through its own `SMTP_*`. Either one being down loses half the pair.
- **Deployments carry a secret.** `KEYCLOAK_ADMIN_CLIENT_SECRET` is server-side only and has no
  `NEXT_PUBLIC_` twin. The same value must be given to the API and to Keycloak, which
  substitutes it into the realm import.
- **Existing realms need a manual step.** `--import-realm` skips a realm that already exists, so
  redeploying the auth service does not add `nkwapa-api` to staging or production. See
  `docs/KEYCLOAK_SERVICE_ACCOUNT_ROLLOUT.md`.

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
- 12 hour default lifespan for admin-issued action tokens, stated rather than inherited,
  because a patient-facing account-setup link is now issued that way; each invitation
  overrides it with its own remaining lifetime, so the link and the invitation expire together
- a confidential `nkwapa-api` service account holding `manage-users` on `realm-management` and
  nothing else, with no browser-facing flow and no redirect URIs; `nkwapa-web` stays public and
  gains no capability from it
- exact web origin and redirect URI allowlists for local, staging, and production frontends

---

## Current Gaps

- zone is a reporting filter rather than a permission scope; zone-scoped roles are deliberately
  not implemented, and the Zone Model section above is the statement of record
- organization-level roles do not exist yet. The organization report (`GET
/organizations/:id/report`, #13) sits behind its own permission, `ORGANIZATION.REPORT.READ`,
  which is granted to no role, so today only `SYSTEM_ADMIN` reads it through `'*'`. It is named so
  a future organization leadership role can be given exactly that, instead of a director's clinic
  permissions being stretched across an organization
- Keycloak still provides identity only; app-side policy remains the authority and must continue to be tested independently
- patient invitations reach an email address only; provisioning an identity from a phone number
  is not implemented, and a phone-only invite is recorded as such rather than failing
