# User and Role Setup Guide

This guide explains how users are created, how roles are assigned, how clinic scope works, and how to handle staff and patient access lifecycle in the current Nkwapa codebase.

---

## 1. Core Rule

Keycloak handles identity.

Nkwapa handles authorization.

That means:

- Keycloak creates the login account
- Nkwapa stores the local user record
- Nkwapa `UserClinicRole` rows decide what the user can do
- removing or changing a user’s app access happens in Nkwapa, not in Keycloak realm roles

---

## 2. Current Role Types

| Role | Scope | Typical user |
| --- | --- | --- |
| `SYSTEM_ADMIN` | global | platform administrator |
| `DIRECTOR` | clinic | clinic leader |
| `MANAGER` | clinic | operations manager |
| `DOCTOR` | clinic | clinician |
| `PRECEPTOR` | clinic | supervising reviewer |
| `VOLUNTEER` | clinic | intake / screening staff |
| `PATIENT` | clinic-linked self account | patient portal user |

Important note:

- `SYSTEM_ADMIN` uses `clinicId = null`
- most other roles are clinic-scoped

---

## 3. Current Permission Reality

You do not manage permissions directly in Keycloak.

Permissions are computed in the API from local roles in:

- `apps/api/src/auth/constants/permissions.ts`

Examples:

- research export request and approval are local permissions
- clinic ops permissions are local permissions
- patient portal permissions are local permissions

---

## 4. How a User Enters the System

### Step 1. Create the identity in Keycloak

Use Keycloak Admin Console:

1. Go to realm users.
2. Add user.
3. Set username, first name, last name, email if needed.
4. Set credentials.

### Step 2. Let the user log into Nkwapa once

This is important.

The local `User` row is created or hydrated when the user first authenticates against Nkwapa.

If a user exists in Keycloak but has never logged into Nkwapa:

- they may not appear in the Nkwapa admin user views yet

### Step 3. Assign app roles in Nkwapa

Assign roles through:

- `/admin/users`
- API role assignment endpoints
- seed script for the first admin path

---

## 5. Creating the First System Admin

### Option A. Seed path

1. Create the user in Keycloak.
2. Get the user `sub`.
3. Set:

```bash
SEED_SYSTEM_ADMIN_SUB=<keycloak-sub>
SEED_SYSTEM_ADMIN_NAME="System Admin"
```

4. Run:

```bash
npm run db:seed
```

What the seed does today:

- creates or updates the demo clinic
- creates the local user if needed
- assigns global `SYSTEM_ADMIN`
- also assigns clinic `DIRECTOR` on the demo clinic
- seeds clinic research settings
- seeds drug catalog
- optionally seeds sample patient data

### Option B. Assign later

If the local user already exists and you need to elevate them, use:

```bash
npm run db:assign-system-admin
```

Check the script inputs before running it in a shared environment.

---

## 6. Creating a Director

1. Create the user in Keycloak.
2. Have them log into Nkwapa once.
3. Open `/admin/users` as system admin.
4. Find the user.
5. Assign `DIRECTOR` for the target clinic.

Director authority in the current product:

- clinic management
- clinic roster visibility
- research settings updates
- research export request and approval
- audit access
- clinic-level role assignment within allowed bounds

---

## 7. Creating a Manager

1. Create the user in Keycloak.
2. Have them log into Nkwapa.
3. In `/admin/users`, assign `MANAGER` for the clinic.

Manager capabilities today include:

- clinic ops management
- shift and assignment visibility
- patient creation and update support
- clinic roster visibility
- lifecycle actions for allowed subordinate roles
- dashboard and audit visibility

---

## 8. Creating Clinical Staff

### Doctor

Assign `DOCTOR` for the clinic.

Main current abilities:

- encounter creation and reads
- doctor finalization
- care plan write
- prescription write
- reminders read/create context
- dashboard access
- self assignment board access

### Preceptor

Assign `PRECEPTOR` for the clinic.

Main current abilities:

- encounter review
- screening write/read
- dashboard access

### Volunteer

Assign `VOLUNTEER` for the clinic.

Main current abilities:

- patient creation and search
- encounter creation and submit-for-review
- screening write
- consent recording
- self assignment board access

---

## 9. Creating a Patient Portal User

There are two parts:

1. Keycloak identity
2. link between that identity and a local patient record

### Recommended flow

1. Create the user in Keycloak.
2. Have them log in once to create the local `User` record.
3. Assign the `PATIENT` role as appropriate.
4. Use the staff-side portal link action for the patient record.

Current linking surface:

- clinic staff can use the portal linking flow exposed from clinic patient routes

Portal access will not work correctly unless:

- the local user exists
- the patient account link exists
- clinic context is correct

---

## 10. Creating a Clinic

Primary UI:

- `/admin/clinics`

Current behavior:

- system admins can create clinics
- directors can view and manage within their authority depending on current policy

After clinic creation, make sure to assign clinic roles explicitly if needed.

---

## 11. Assigning Roles in the UI

Current main UI:

- `/admin/users`

Typical flow:

1. open the users page
2. switch between clinic view and all-users view if you are system admin
3. open a user detail sheet
4. review active and global roles
5. choose role and clinic
6. save

The page also supports:

- role revocation
- user deactivation
- status filtering
- role filtering

---

## 12. Role Revocation

Two patterns exist:

- generic admin role revocation
- clinic-specific lifecycle revocation

Current important rule:

- removing a role removes the access represented by that `UserClinicRole`

Use this when:

- staff changed clinics
- a user no longer needs a specific role
- portal access should be removed without disabling the account entirely

---

## 13. User Deactivation

Nkwapa prefers deactivation over deletion.

Current deactivation behavior:

- `User.isActive` becomes `false`
- future authenticated API access should be blocked
- audit event is written

Use deactivation when:

- a staff member leaves
- a user should lose all access immediately
- you need to preserve history and audit integrity

Do not expect hard deletes to be the default lifecycle path.

---

## 14. Current Lifecycle Rules

The backend enforces safety rules in `AdminService`.

Examples:

- you cannot deactivate yourself
- clinic-level actors cannot take actions outside allowed clinic scope
- role assignment and revocation authority depends on actor role
- not every actor can revoke every role

This means:

- UI may hide actions
- backend still remains the final authority

---

## 15. Clinic Scope and Active Clinic

Users with multiple clinic memberships depend on the active clinic context.

Current behavior:

- web app stores active clinic in localStorage
- requests send `X-Clinic-Id`
- `/auth/whoami` resolves effective roles and permissions for that clinic

If a user appears to have the wrong access:

1. check active clinic in the header
2. check the actual `UserClinicRole` entries
3. confirm `X-Clinic-Id` is being sent

---

## 16. Recommended Setup Order for a New Environment

1. Start infra services.
2. Configure backend and web env files.
3. Run Prisma generate and migrate.
4. Seed the demo clinic and first admin.
5. Log in as the first admin.
6. Create additional clinics if needed.
7. Create users in Keycloak.
8. Have each user log in once.
9. Assign clinic and global roles in `/admin/users`.
10. Link portal users to patient records where needed.

---

## 17. Useful Commands

```bash
npm run db:generate
npm run db:migrate:dev
npm run db:seed
npm run db:assign-system-admin
```

To start infra:

```bash
cd infra/nkwapa
docker compose up -d
```

---

## 18. Common Setup Problems

### User does not appear in `/admin/users`

Likely cause:

- user has not logged into Nkwapa yet

### User can log in but sees no clinic data

Likely cause:

- no `UserClinicRole` for the selected clinic

### User has wrong access in one clinic but not another

Likely cause:

- active clinic mismatch

### Patient portal login works but portal data is missing

Likely causes:

- missing `PATIENT` role
- missing patient account link
- wrong clinic context

### Deactivated user still appears in lists

This can be normal if the page filter includes inactive users.

---

## 19. Related Documentation

- `docs/FEATURE_WORKFLOWS_GUIDE.md`
- `docs/USER_TESTING_GUIDE.md`
- `IMPLEMENTATION_STATUS.md`
- `memory.md`
