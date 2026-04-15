Perfect — Queues as the landing page fits real clinic ops (people open the app to do today’s work, not to browse).

Here’s the agent-ready implementation pack for the basic UI (Option C) with:
• exact routes + file structure
• components inventory
• API contract checklist per page
• acceptance criteria
• copy/paste prompts for UI agents

No dashboard polish yet — just a clean, usable UI that exercises your backend correctly.

⸻

1. UX flow decisions locked for Basic UI
   • Post-login redirect: /queues
   • Default queue tab shown based on permissions (priority):
   1. Doctor → Finalize
   2. Preceptor → Review
   3. Volunteer → Drafts
      • Clinic selector required if multiple clinics; otherwise auto-select.
      • Country selector in phone input locked to Ghana.

⸻

2. Next.js route + file structure (recommended)

apps/web/app/

app/
(auth)/
login/page.tsx
callback/page.tsx # if needed for Keycloak redirect handling
(app)/
layout.tsx # AppShell (TopBar + SideNav)
page.tsx # redirects to /queues
queues/
page.tsx # queue landing with tabs + smart default
drafts/page.tsx
review/page.tsx
finalize/page.tsx
patients/
page.tsx # search/list
new/page.tsx
[patientId]/
page.tsx # profile + tabs
encounters/
new/page.tsx # check-in wizard
encounters/
[encounterId]/page.tsx
audit/page.tsx
settings/
clinic/page.tsx

apps/web/components/

components/
shell/
AppShell.tsx
TopBar.tsx
SideNav.tsx
ClinicSelector.tsx
RoleBadges.tsx
SyncStatusPill.tsx
tables/
DataGridBase.tsx
PatientsGrid.tsx
QueueGrid.tsx
AuditGrid.tsx
forms/
PatientForm.tsx
ConsentForm.tsx
EncounterWizard.tsx
CarePlanForm.tsx
PhoneInputGH.tsx
state/
useWhoami.ts
useActiveClinic.ts
usePermissions.ts
useSyncStatus.ts
api/
client.ts
auth.ts
patients.ts
encounters.ts
consents.ts
audit.ts
settings.ts
sync.ts

⸻

3. Component inventory (build once, reuse everywhere)

App shell components
• AppShell: layout wrapper with TopBar + SideNav + main content
• TopBar:
• ClinicSelector
• RoleBadges
• SyncStatusPill
• user menu (logout)
• SideNav: links filtered by permission

DataGrid wrappers (MUI X)
• DataGridBase: standard config (loading, empty state, row click)
• QueueGrid: common columns + CTA
• PatientsGrid: search results
• AuditGrid: filterable table

Forms (shadcn)
• PhoneInputGH: locked GH, returns E.164 candidate
• PatientForm
• ConsentForm
• EncounterWizard (stepper)
• CarePlanForm

⸻

4. API contract checklist per page (so UI doesn’t guess)

Bootstrap (global)
• GET /auth/whoami returns:
• memberships: clinics + roles[]
• effectivePermissionsForActiveClinic
• Active clinic chosen client-side; clinicId used in path params.

Queues
• Drafts:
• GET /clinics/:clinicId/encounters?status=DRAFT
• Review:
• GET /clinics/:clinicId/encounters?status=IN_REVIEW&stage=PRECEPTOR
(or filter by preceptorReviewedById is null)
• Finalize:
• GET /clinics/:clinicId/encounters?status=IN_REVIEW&stage=DOCTOR
(or filter by preceptorReviewedById not null and doctorFinalizedById null)

Each returns rows including:
• encounterId, patientId, patientName, patientCode
• createdAt, updatedAt
• BP classification + glucose flag (optional but helpful)
• status, preceptorReviewedById, doctorFinalizedById

Encounter detail
• GET /encounters/:encounterId
• state transitions:
• POST /encounters/:id/submit
• POST /encounters/:id/preceptor-review
• POST /encounters/:id/finalize
• upserts:
• PATCH /encounters/:id/vitals
• PATCH /encounters/:id/hypertension
• PATCH /encounters/:id/diabetes
• PATCH /encounters/:id/care-plan

Patients
• GET /clinics/:clinicId/patients/search?q=...
• POST /clinics/:clinicId/patients
• GET /patients/:patientId

Consent
• POST /clinics/:clinicId/patients/:patientId/consents
• POST /clinics/:clinicId/patients/:patientId/consents/revoke

Sync (global component)
• POST /sync/push
• GET /sync/pull?clinicId=&since=

Audit / Settings (basic)
• GET /clinics/:clinicId/audit?...
• GET/PUT /clinics/:clinicId/research/settings

⸻

5. Acceptance criteria (Basic UI phase)

Queues
• Landing page is /queues
• Shows tabs (Draft/Review/Finalize) only if user has permission
• Defaults to the highest priority tab available
• Clicking a row opens encounter detail

Encounter
• User can complete the workflow appropriate to their role
• Status updates are reflected in queues
• FINALIZED encounters read-only

Patients
• Create patient works online and offline
• Duplicate national ID shows a conflict dialog and links to existing patient
• Patient profile shows consent status and encounter list

Consent
• Consent “Grant” stores consent_version=v1-en and snapshot
• Consent revoke updates status and UI reflects it

Sync
• Sync indicator shows offline/pending count
• Manual “Sync now” works and clears outbox on success

⸻

6. Copy/paste prompts for UI agents (Option C)

UI-1: App Shell + Queues landing

Implement Basic UI Shell + Queues landing for Nkwapa EMR (Option C: MUI X + shadcn).

Deliverables:

1. App shell in apps/web/app/(app)/layout.tsx:
   - TopBar: ClinicSelector, RoleBadges, SyncStatusPill, User menu
   - SideNav: permission-based links
2. Bootstrap:
   - useWhoami hook calls GET /auth/whoami on load
   - activeClinic selection:
     - if 1 clinic -> auto
     - if >1 -> modal selector
   - store activeClinicId in localStorage
3. /queues landing:
   - Tabs: Drafts/Review/Finalize shown based on permissions
   - Default tab priority: Finalize > Review > Drafts
   - Each tab uses QueueGrid (MUI X DataGrid wrapper)
   - Clicking row navigates to /encounters/:encounterId
4. SyncStatusPill:
   - shows online/offline
   - shows pending outbox count from Dexie
   - manual Sync button triggers sync.ts client
     Acceptance:

- Login -> redirects to /queues
- UI renders with no console errors
- Tabs show/hide correctly for multi-role users

UI-2: Patients list + new patient form

Implement Patients UI.

Routes:

- /patients: search + results grid (MUI X)
- /patients/new: patient create form (shadcn + PhoneInputGH)

Requirements:

- PhoneInputGH must lock country to Ghana (GH) and produce E.164 candidate (+233...)
- POST /clinics/:clinicId/patients on submit; if offline, store locally + outbox
- Handle 409 duplicate national ID:
  - show dialog with existing patient_code + “Open patient”
- /patients grid supports searching by q param and calls /clinics/:clinicId/patients/search?q=
  Acceptance:
- Creating patient online shows success and routes to patient profile
- Creating patient offline shows pending sync banner

UI-3: Patient profile + consent UI

Implement Patient Profile UI.

Route:

- /patients/:patientId

Sections:

- Header: name, patient_code, phone, consent badge
- Tabs: Overview, Encounters, Consent
- Encounters tab: list recent encounters and link to /encounters/:encounterId
- Consent tab:
  - Show current consent status for clinic
  - Grant consent: POST /clinics/:clinicId/patients/:patientId/consents
    - consent_version = v1-en
    - consent_text_snapshot displayed and stored exactly
  - Revoke: POST /clinics/:clinicId/patients/:patientId/consents/revoke
    Offline:
- Both actions must work offline via outbox and show pending banner
  Acceptance:
- Consent status updates immediately in UI (optimistic), reconciles on sync

UI-4: Encounter wizard + encounter detail

Implement Encounter Wizard and Encounter Detail UI.

Routes:

- /patients/:patientId/encounters/new : wizard flow
- /encounters/:encounterId : detail view with role-based actions

Wizard:

- Create encounter (DRAFT)
- Steps: Vitals -> HTN -> Diabetes -> Review -> Submit
- Submit transitions DRAFT -> IN_REVIEW (POST /encounters/:id/submit)

Detail:

- Show status + read/write based on role and encounter status
- Preceptor action: POST /encounters/:id/preceptor-review
- Doctor action: CarePlan form + POST /encounters/:id/finalize
  Acceptance:
- After submit/review/finalize, encounter disappears/appears in correct queue
- FINALIZED encounter is read-only

UI-5: Audit + Clinic Settings (basic)

Implement basic admin pages:

- /audit:
  - MUI X grid with filters (date range, action, actor)
  - Calls GET /clinics/:clinicId/audit?...
- /settings/clinic:
  - Toggles: research_enabled and requires_director_approval_each_export
  - Calls GET and PUT /clinics/:clinicId/research/settings
    Acceptance:
- Only users with permissions see these nav links and can access pages

⸻

7. Next backend items after Basic UI (so agents can queue up)

Once the UI is in, the next “make it clinic-ready” items are: 1. Reminder worker + Fake SMS provider (so follow-up isn’t just a date field) 2. Encounter state machine hardening (server-side enforcement) 3. Audit query filters + pagination 4. Conflict resolution UI improvements (duplicate patient resolution workflow)

⸻
