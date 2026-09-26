# User And Role Setup Guide

This guide explains how identity, authorization, clinic scope, and patient access are configured in the current Nkwapa codebase.

---

## 1. Core Rule

Keycloak handles identity.

Nkwapa handles authorization.

That means:

- Keycloak stores the login account and password lifecycle
- Nkwapa stores the local `User`
- Nkwapa stores clinic memberships and roles in `UserClinicRole`
- changing what a user can do happens in Nkwapa, not by relying on Keycloak realm roles

---

## 2. Current Tenant Shape

The live data model is:

`Organization -> Clinic(Location) -> User memberships and patient workflows`

Current access control still operates mainly at clinic scope.

Important notes:

- `SYSTEM_ADMIN` is global and uses `clinicId = null`
- most other roles are assigned per clinic
- `zoneCode` groups clinics for reporting and filtering. It is a **filter, not a permission**:
  putting two clinics in one zone lets you report on them together and gives nobody access to
  either. Zone-scoped roles do not exist, by decision -- see the Zone Model section of
  `docs/specs/03_AUTH_AND_RBAC.md`.
- organization is also a **filter, not a permission** (#12). `/admin/clinics` shows each clinic's
  organization and can be filtered by it, and a system admin's all-users view on `/admin/users`
  can be narrowed to one organization. A user belongs to an organization only through the clinics
  they hold a role in, so a global-only account appears under none. Every filter is ANDed onto the
  viewer's own scope: a director who names another organization gets an empty list, never its
  clinics. The organization picker appears only when there is more than one organization to pick.

---

## 3. Current Roles

| Role           | Scope         | Typical use                                |
| -------------- | ------------- | ------------------------------------------ |
| `SYSTEM_ADMIN` | global        | platform admin and cross-clinic control    |
| `DIRECTOR`     | clinic        | clinic leadership and research approval    |
| `MANAGER`      | clinic        | clinic operations and staff lifecycle      |
| `DOCTOR`       | clinic        | clinical review, finalization, prescribing |
| `VOLUNTEER`    | clinic        | intake, screening, consent                 |
| `PATIENT`      | clinic-linked | portal self-service                        |

---

## 4. Permission Reality

Permissions are not directly managed in Keycloak.

They are computed inside the API from local role mappings in:

- `apps/api/src/auth/constants/permissions.ts`

Examples:

- research export request and approval
- clinic operations permissions
- patient portal link and read actions
- sync, dashboard, audit, and reminder permissions

---

## 5. First System Admin Setup

### Recommended seed path

1. Create the user in Keycloak.
2. Obtain the user's `sub`.
3. Set:

```bash
SEED_SYSTEM_ADMIN_SUB=<keycloak-sub>
SEED_SYSTEM_ADMIN_NAME="System Admin"
```

4. Run:

```bash
npm run db:seed
```

The seed now also creates or updates:

- the default organization
- the default clinic/location
- the clinic research settings when a seed admin exists
- demo drug catalog

### Later elevation path

If the local user already exists and only needs the global admin role:

```bash
npm run db:assign-system-admin
```

---

## 6. Staff User Setup

### Managers, doctors, and volunteers: invite by email

Nobody needs Keycloak credentials to add a colleague. On `/admin/users`, with the clinic
selected, a director of that clinic or a system admin uses **Invite a colleague**:

1. Enter an address only that person reads, pick the role (Manager, Doctor or Volunteer) and how
   long the invitation stays open (24 hours, 3 days, or 7 days; 3 days by default).
2. Nkwapa creates the Keycloak account and Keycloak emails a "Choose your Nkwapa password" link.
   Nkwapa sends a second email naming the clinic, the role and that password email.
3. The colleague sets a password, signs in, and lands on `/accept-invite`, where they check the
   clinic and role and accept. The role is granted at that moment, in that clinic only.

The invitation list keeps every invitation, including cancelled and expired ones, and shows two
separate facts for an open one: whether an account stands behind it, and whether the email went
out. **Resend** is safe at any time. It only sends the setup steps that are still outstanding and
never resets a password someone has already chosen. **Cancel** stops the link granting anything.

What is refused, and why:

- **Director and System Admin** are never granted by email, by anyone. Those stay deliberate,
  manual assignments (below).
- **A director invites only into a clinic they direct.** Managers do not invite; they keep their
  existing lifecycle authority over doctor and volunteer seats.
- **Shared inboxes** such as `info@`, `reception@`, `admin@` are refused outright. A staff
  invitation has no second check, so whoever reads the inbox would get the role.
- **An address that already belongs to a staff account** is not refused, but the inviter is told
  and has to confirm. Accepting adds the role to that existing account.
- **A deactivated account** cannot be re-admitted through an invitation; reactivate it first.

Every step is audited: `STAFF.INVITE.CREATE`, `.RESEND`, `.CANCEL`, `.IDENTITY`, `.ACCEPT`,
`.EXPIRE`, and the grant itself as `ROLE.GRANT` with the invitation it came from.

If the list shows **Account not created**, the card says why. The usual causes are the
service-account setup in `docs/KEYCLOAK_SERVICE_ACCOUNT_ROLLOUT.md`, or `APP_PUBLIC_URL` unset on
the API. The invitation still stands; resend once it is fixed.

### Directors and system admins: assign by hand

1. Ask the person to sign in once (an invitation to any role is the easy way to get them an
   account), so their local `User` record exists.
2. Open `/admin/users` as a system admin (or a director, for a Director seat in their clinic).
3. Assign the role for the target clinic.

This pattern is for **staff only**. Patients are not set up this way, and creating a Keycloak
identity for a patient by hand is no longer the supported path: issuing a portal invite from
the patient chart provisions the account and emails the patient a setup link. See the Patient
Users section of `docs/specs/03_AUTH_AND_RBAC.md`.

### Existing deployment cleanup after the doctor role migration

The Prisma migration converts the retired preceptor operational role to `DOCTOR`. After deploying
and running `npm run db:migrate:deploy`, operators can verify cleanup with:

```sql
SELECT COUNT(*) AS retired_user_roles
FROM "UserClinicRole"
WHERE "role"::text = 'PRECEPTOR';

SELECT COUNT(*) AS retired_shift_roles
FROM "StaffShift"
WHERE "roleAtShift"::text = 'PRECEPTOR';

SELECT "userId", "clinicId", COUNT(*) AS doctor_role_rows
FROM "UserClinicRole"
WHERE "role"::text = 'DOCTOR'
GROUP BY "userId", "clinicId"
HAVING COUNT(*) > 1;
```

All three queries should return zero rows or zero counts. Existing Keycloak realms should also
delete the old realm role after the database migration:

```bash
kcadm.sh delete roles/PRECEPTOR -r nkwapa
```

Keycloak realm roles are descriptive in Nkwapa, but removing the retired realm role prevents future
operator confusion.

---

## 7. Patient Portal User Setup

There are two supported patterns.

### Pattern A: direct portal link

Use this when the patient already has a local Nkwapa user account.

1. Create the Keycloak identity.
2. Let the user log into Nkwapa once.
3. Open the patient chart.
4. Use the portal-link action to connect the user to the chart.

### Pattern B: invite and claim

Use this when staff wants to stage access and let the patient claim it later.

1. Open the patient chart.
2. Create a portal invite.
3. The patient logs in through Keycloak.
4. `/auth/whoami` returns onboarding state when claim is required.
5. The patient finishes `/claim-record`.

Important note:

- assigning `PATIENT` alone is not enough if the account is not linked to the patient chart

---

## 8. Creating A Clinic

Primary UI:

- `/admin/clinics`

Current behavior:

- system admins and directors can create clinics
- a director who creates a clinic is granted the directorship of it
- clinics belong to an organization and carry location metadata
- role assignments still need to be created separately after the clinic exists

### Location metadata

The create and edit dialogs collect the metadata organization reporting depends on. These are
validated on both sides from one shared rule set, so the form and the API can never disagree.

| Field         | Required | Notes                                                                                             |
| ------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Name          | Yes      | Not unique. Two clinics may share a name; their location codes still may not.                     |
| Region        | No       | Free text, for display.                                                                           |
| Organization  | Yes      | Read-only once the clinic exists. Selectable on create only when more than one exists.            |
| Location code | Yes      | Prefilled from the name, editable. **Unique within the organization.** Lowercase, hyphens.        |
| Time zone     | Yes      | A named IANA zone. Drives appointment times, reminders, and daily reporting.                      |
| Zone code     | No       | Groups clinics for reporting and filtering. Reuse an existing spelling; the dialog suggests them. |
| Country code  | Yes      | ISO-3166 alpha-2. Defaults to `GH`.                                                               |

Creating an organization is not part of this flow. Clinics are filed under organizations that
already exist.

### Spotting and fixing bad metadata

The registry marks any clinic whose metadata is unusable, and the **Needs attention** filter
narrows the list to those. Editing from a flagged row opens the dialog on the offending field.

For an existing environment, or to check every organization at once, run the audit:

```bash
npm run db:audit-clinics            # report only
npm run db:audit-clinics -- --apply # fix what can be derived unambiguously
```

Repair steps, including the two cases that deliberately need a person, are in
`docs/DATABASE_SETUP.md` under "Clinic Metadata Quality".

Common seed fields for new environments:

- organization name and slug
- clinic name
- clinic location code
- clinic timezone
- clinic zone code, when clinics are grouped into zones for reporting

---

## 9. Deactivation And Lifecycle

Deactivating someone ends their sign-in as well as their access to Nkwapa (issue #126). Both
halves are shown separately on the account page, because they can fail separately.

**Deactivate** (account page on `/admin/users`):

- **Their only clinic, or a global deactivation by a system admin:** `User.isActive` is set to
  false at once, which blocks every API and app request on the next call. Then, after the request
  has committed, a background job disables the Keycloak identity and ends every open session. The
  account page shows **Sign-in disabled** when that lands.
- **They also work in another clinic** (only a system admin can reach this from a clinic roster):
  only this clinic's roles are withdrawn. The account and the sign-in stay active for the clinics
  they still work in. Getting this backwards would lock a working clinician out of a clinic that
  never asked for it.

**Reactivate:** the same people who may deactivate may reactivate. It restores `isActive`,
re-enables the Keycloak identity, and emails the person that they can sign in again with their
existing password.

**When the sign-in half fails.** Keycloak being down never delays or undoes the local block; the
job retries on its own for a few minutes. If it still cannot finish, the account page says
**Can still sign in** (after a deactivation) or **Cannot sign in** (after a reactivation), with the
reason, and a **Sync sign-in** button. Users deactivated before this existed show **Sign-in not yet
disabled**, and the same button fixes them.

Repeating a deactivation or a reactivation is safe. It changes nothing locally, sends no email,
and re-runs the sign-in half.

What never happens: the Keycloak user is **disabled, never deleted**. Audit events and portal links
reference its subject, and deleting it would break the record of who did what.

Audit: `USER.DEACTIVATE`, `USER.REACTIVATE`, `ROLE.REVOKE` (for a clinic-only withdrawal), and
`USER.IDENTITY.DISABLE` / `USER.IDENTITY.ENABLE` with the outcome and a failure code.

Patient portal accounts are not covered yet: a patient is not deactivated by an administrator in
the same way, and that trigger is a separate change.

---

## 10. Password Reset And Recovery

Forgot Password, email verification, temporary passwords, and required password updates are owned by
Keycloak. Nkwapa must not store raw passwords or expose an app/API password reset endpoint.

Required Keycloak settings:

- `resetPasswordAllowed: true`
- a working realm SMTP `Host` and `From`
- `KC_SSL_REQUIRED=none` for local Docker HTTP QA and `KC_SSL_REQUIRED=external` for staging and
  production
- reset credentials flow set to `reset credentials`
- the `reset-credential-email` authenticator present in that flow
- the `UPDATE_PASSWORD` required action enabled
- the `VERIFY_EMAIL` required action enabled
- `verifyEmail: true`

Local forgot-password QA:

1. Start local infra with `docker compose -f infra/nkwapa/docker-compose.yml up -d`.
2. Open the app sign-in path and use Forgot Password.
3. Open Mailpit at `http://localhost:8025`.
4. Follow the reset link, set a new password, and verify Keycloak returns the user to the app.
5. Reuse an old reset link and verify the expired/invalid token state uses the branded recovery UI.

Local temporary-password QA:

1. Start local infra and create or choose a Keycloak user.
2. Set a temporary credential in Keycloak Admin or with `kcadm.sh set-password --temporary`.
3. Sign in as that user.
4. Verify the user is routed to the branded update-password screen.
5. Submit a password that violates policy and confirm the Keycloak policy message is readable.
6. Submit a valid password and verify the user returns through the normal app login flow.

Local verify-email QA:

1. Start local infra and create or choose a Keycloak user with an email address.
2. Trigger a verification email with `send-verify-email` or the Admin Console.
3. Open Mailpit at `http://localhost:8025`.
4. Follow the verification link and verify the branded info/required-action pages are shown.
5. Reuse or alter the link and verify the branded expired/invalid action-token page is shown.

Staging and production:

- set the `KC_SMTP_*` variables from `deploy/env/*.keycloak.env.example`
- use provider-backed SMTP credentials stored as deployment secrets
- recreate or explicitly re-import the realm when changing realm import settings; Keycloak startup
  import skips realms that already exist

Admin-triggered password reset:

Use Keycloak Admin REST `execute-actions-email` with `UPDATE_PASSWORD`:

```bash
PUT /admin/realms/nkwapa/users/<user-id>/execute-actions-email
Content-Type: application/json

["UPDATE_PASSWORD"]
```

Do not use the older `reset-password-email` endpoint. Direct admin password setting through
`/reset-password` is only appropriate for deterministic test setup, not normal user recovery.

Admin-triggered email verification:

Use Keycloak Admin REST `send-verify-email` when the only action needed is verifying the user's
email address:

```bash
PUT /admin/realms/nkwapa/users/<user-id>/send-verify-email
```

Admin-triggered combined required actions:

Use `execute-actions-email` when an operator needs the same email to require one or more actions:

```bash
PUT /admin/realms/nkwapa/users/<user-id>/execute-actions-email
Content-Type: application/json

["VERIFY_EMAIL"]
```

```bash
PUT /admin/realms/nkwapa/users/<user-id>/execute-actions-email
Content-Type: application/json

["VERIFY_EMAIL", "UPDATE_PASSWORD"]
```

Temporary-password users should be handled through the `UPDATE_PASSWORD` required action or a
temporary credential that causes Keycloak to require `UPDATE_PASSWORD` at the next login. Do not
replace this with a custom Nkwapa app form.

---

## 11. Email Quality Policy

Nkwapa validates email quality in two layers:

- DTO validation normalizes email input by trimming whitespace and lowercasing the address.
- DTO validation rejects malformed addresses and conservative disallowed domains before service
  logic runs.

Disallowed domains include:

- `localhost` and `.localhost`
- reserved or documentation domains such as `.test`, `.invalid`, `.example`, `example.com`,
  `example.net`, and `example.org`
- IP-literal domains
- the initial disposable-domain denylist used by the API

Portal invites are deliverability-sensitive. When an invite includes an email address, the API
performs a fail-closed MX lookup before creating the invite. A domain with no MX records, or a DNS
lookup failure, returns a field-level validation error for `email`.

This is a domain-level deliverability guarantee only. It confirms that the domain appears able to
receive email. It does not prove that a specific mailbox exists. Do not describe patient portal
invites, password resets, verification emails, or reminders as guaranteed to reach a mailbox unless
Nkwapa later integrates a vetted email validation provider with mailbox-level checks.

For login accounts, Keycloak remains the source of truth for email verification. The realm export
sets `verifyEmail: true` and enables the `VERIFY_EMAIL` required action. The API only syncs the
Keycloak email claim into the local `User` record when the token includes `email_verified: true`.
Unverified Keycloak emails are not used as a local contact email or display-name fallback.

Sensitive telemetry must not include full email addresses. API request and exception logging already
redacts email-shaped values; avoid adding logs that serialize raw invite payloads or token claims.

---

## 12. Key Reminders

- Keycloak manages passwords, reset tokens, and session expiry.
- Nkwapa manages permissions, memberships, and clinic scope.
- Staff and patients usually need one successful login before local admin tooling sees them.
- Portal access should be created from the patient record, not by role assignment alone.
- Current frontend allowlists for Keycloak and API CORS are exact-origin based, so environment URLs must stay in sync with deployment configuration.
