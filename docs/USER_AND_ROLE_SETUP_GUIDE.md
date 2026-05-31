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
- `zoneCode` exists on clinics for future scale-up, but zone RBAC is not yet active

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

Recommended pattern for directors, managers, doctors, and volunteers:

1. Create the identity in Keycloak.
2. Let the user log into Nkwapa once.
3. Open `/admin/users` as an authorized admin.
4. Assign the correct role for the target clinic.

Why step 2 matters:

- the local `User` record is created or hydrated on first successful login
- users that only exist in Keycloak may not yet appear in Nkwapa admin views

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

- system admins can create clinics
- clinics belong to an organization and carry location metadata
- role assignments still need to be created separately after the clinic exists

Common seed fields for new environments:

- organization name and slug
- clinic name
- clinic location code
- clinic timezone
- clinic zone code when relevant later

---

## 9. Deactivation And Lifecycle

Current behavior:

- users can be deactivated without hard deletion
- clinic roles can be revoked
- deactivated users should fail app bootstrap or lose access
- self-destructive admin actions are blocked where unsafe

Main surfaces:

- `/admin/users`
- clinic roster actions

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

## 11. Key Reminders

- Keycloak manages passwords, reset tokens, and session expiry.
- Nkwapa manages permissions, memberships, and clinic scope.
- Staff and patients usually need one successful login before local admin tooling sees them.
- Portal access should be created from the patient record, not by role assignment alone.
- Current frontend allowlists for Keycloak and API CORS are exact-origin based, so environment URLs must stay in sync with deployment configuration.
