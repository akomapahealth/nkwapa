# User and Role Setup Guide

This guide explains how to create users and assign roles in Nkwapa EMR. **Roles are stored in the database (UserClinicRole), not in Keycloak.** Keycloak handles identity (login); Nkwapa assigns authorization (roles).

---

## Architecture

| Component | Purpose |
|-----------|---------|
| **Keycloak** | Identity only: login, JWT `sub`, user creation |
| **Nkwapa DB** | Authorization: `UserClinicRole` (userId, clinicId, role) is the source of truth |
| **API** | Uses `UserClinicRole` for RBAC; never reads Keycloak realm roles |

Users are created in Keycloak first. On first login to Nkwapa, the user record is created in the database. Roles are assigned via the Nkwapa Admin UI or seed script.

> **Important:** Users appear in the Staff table only after they have logged in to Nkwapa at least once. If you create a user in Keycloak but don't see them in Admin → Staff, have that user visit the Nkwapa web app and authenticate—then refresh the Staff page.

---

## Creating the First System Admin

1. **Create user in Keycloak Admin Console**
   - Navigate to your realm → Users → Add user
   - Set username, email, first name, last name
   - Credentials tab → Set password → Save

2. **Get the user's Keycloak `sub`**
   - In Keycloak: Users → select user → Details tab → copy the `sub` (UUID)
   - Or: have the user log in once and inspect the JWT `sub` claim

3. **Run the seed script**
   ```bash
   SEED_SYSTEM_ADMIN_SUB=<sub> pnpm db:seed
   ```
   Optionally: `SEED_SYSTEM_ADMIN_NAME="Your Name"`

4. **Log in to Nkwapa**
   - The user now has SYSTEM_ADMIN (global) and DIRECTOR (for the seed clinic)

---

## Creating a Director

1. **Create user in Keycloak**
   - Admin → Users → Add user
   - Set username, email, first/last name
   - Credentials tab → Set password → Save

2. **User must log in once to Nkwapa**
   - The user **must** visit the Nkwapa web app (authenticate with Keycloak) before they will appear in Admin → Staff. This creates the User record in the database.

3. **Assign DIRECTOR role**
   - System Admin: go to Admin → Staff
   - Find the user → "Manage roles"
   - Assign role: DIRECTOR, select clinic
   - Or use API: `POST /admin/users/:userId/roles` with `{ clinicId, role: "DIRECTOR" }`

---

## Creating a Manager

1. Create user in Keycloak (same as Director)
2. User logs in once to Nkwapa
3. Director or System Admin: Admin → Staff → Manage roles → Assign MANAGER, select clinic

---

## Creating a Clinic

- **System Admin or Director**: Admin → Clinics → Create clinic
- When a Director creates a clinic, they automatically receive the DIRECTOR role for that clinic

---

## Keycloak Admin Console Steps

1. Navigate to realm → Users → Add user
2. Set username, email, first name, last name
3. Credentials tab → Set password
4. Save

---

## Role Hierarchy and Permissions

| Role | Who can assign | Scope |
|------|----------------|-------|
| SYSTEM_ADMIN | System Admin only | Global (clinicId=null) |
| DIRECTOR | System Admin only | Per clinic |
| MANAGER, DOCTOR, PRECEPTOR, VOLUNTEER | Director (for their clinics) or System Admin | Per clinic |

Directors can assign MANAGER, DOCTOR, PRECEPTOR, VOLUNTEER only for clinics they direct. They cannot assign DIRECTOR or SYSTEM_ADMIN.

---

## Admin UI Routes

| Route | Purpose | Permission |
|-------|---------|------------|
| `/admin/clinics` | List, create, edit clinics | CLINIC.MANAGE |
| `/admin/users` | List users, assign/remove roles | CLINIC.MANAGE |

Only users with CLINIC.MANAGE (Director or System Admin) see these links in the sidebar.
