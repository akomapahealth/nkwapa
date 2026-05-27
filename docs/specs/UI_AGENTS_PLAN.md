MUI X for data-dense tables (patients/queues/audit) + shadcn/ui + Tailwind for layout/forms/modals. That keeps the “EMR feel” without making the whole app look like a spreadsheet.

Below is a detailed, agent-ready plan for the “basic UI” + the backend endpoints/contracts each screen needs, plus a comprehensive feature list (v1 + near-term + future) so you can run multiple agents without stepping on each other.

⸻

1. Basic UI route map (v1)

Public
• /login (redirects to Keycloak; usually just an auto-redirect page)

Authenticated (all require /auth/whoami bootstrap)
• / → redirects to /patients or /queues based on permissions
• /patients
• /patients/new
• /patients/:patientId
• /patients/:patientId/encounters/new (check-in wizard)
• /encounters/:encounterId
• /queues/drafts (Volunteer)
• /queues/review (Doctor)
• /queues/finalize (Doctor)
• /audit (Manager/Director/Admin)
• /settings/clinic (Director/Admin)
• /sync (optional debug screen; can be hidden behind dev flag)

⸻

2. Global UI components (build once, reused everywhere)

App Shell
• TopBar
• ClinicSelector (shows clinics from whoami memberships)
• RoleBadges (multi-role display)
• SyncStatusPill (online/offline, pending count, last sync time)
• UserMenu (logout)
• SideNav
• permission-based nav items
• active route highlight
• PageLayout
• consistent padding, breadcrumbs (optional)

Shared UX primitives
• MUI X DataGrid wrapper
• standard column sizing, empty states, loading states
• row click navigation
• Form components (shadcn)
• Input, Select, Textarea, Checkbox, DatePicker, Dialog
• PhoneInputGH
• country selector locked to Ghana (GH)
• formats display
• Toast/Notifications
• success/failure; sync conflicts; validation
• ErrorBoundary
• catch page-level errors + show “Try again” button

⸻

3. Screen-by-screen implementation list (basic UI)

A) Bootstrap + Auth

Screen: /login + global bootstrap in App Shell
Needs:
• Keycloak login flow
• On success: call GET /auth/whoami
• Determine activeClinicId
• if only one clinic, auto-select
• else show clinic selector modal
• Persist activeClinicId in localStorage
• Attach it to clinic routes (path params) + sync calls

Edge cases:
• user has multiple clinics but no selection yet
• user has roles but no permissions (misconfig)

⸻

B) Patients list

Route: /patients
UI:
• Search bar (name/code/phone/last4)
• DataGrid: patient_code, name, phone, primary clinic, last visit date (if available)
• Buttons: “New patient”, “Start check-in”

API contracts:
• GET /clinics/:clinicId/patients/search?q=...
• (optional) GET /clinics/:clinicId/patients?cursor=... for pagination later

Offline:
• Search uses local IndexedDB first; if online, enrich from server
• Selecting a patient works offline if cached

⸻

C) New patient

Route: /patients/new
UI:
• first name, last name, DOB, sex
• phone input GH locked
• national ID type + national ID value input (masked)
• optional email
• submit

API:
• POST /clinics/:clinicId/patients

Offline:
• If offline, create locally, enqueue outbox, show “Pending sync” banner

Must handle:
• 409 duplicate national ID: show dialog
• “Open existing patient” (navigate)
• “Cancel and edit”

⸻

D) Patient profile

Route: /patients/:patientId
UI sections:
• Header card: name, patient_code, phone, consent badge
• Actions:
• Start new visit
• Grant/Revoke consent (if permitted)
• Tabs:
• Overview
• Encounters
• Consent

API:
• GET /patients/:patientId
• POST /clinics/:clinicId/patients/:patientId/consents
• POST /clinics/:clinicId/patients/:patientId/consents/revoke

Offline:
• Show cached patient + encounters
• Consent actions work offline → outbox

⸻

E) Check-in wizard (Encounter create + screening)

Route: /patients/:patientId/encounters/new
UI flow (single page wizard): 1. Confirm patient 2. Vitals 3. HTN assessment (auto classification) 4. Diabetes screening 5. Review + “Submit for clinical review”

API:
• POST /clinics/:clinicId/encounters (creates DRAFT)
• PATCH /encounters/:encounterId/vitals (or upsert endpoint)
• PATCH /encounters/:encounterId/hypertension
• PATCH /encounters/:encounterId/diabetes
• POST /encounters/:encounterId/submit (DRAFT → IN_REVIEW)

(If you already use sync-mutations only, then these can be local writes + sync. But UI still needs a consistent “save” action.)

Offline:
• Entire wizard works offline
• Submit button changes status locally; sync later enforces

⸻

F) Encounter detail

Route: /encounters/:encounterId
UI:
• Status pill: DRAFT / IN_REVIEW / FINALIZED
• Sections: vitals, HTN, DM, notes, care plan
• Actions:
• Volunteer: edit if DRAFT
• Doctor: edit/review if IN_REVIEW
• Doctor: finalize if IN_REVIEW (and reviewed)
• Mini audit log (optional): last 5 events

API:
• GET /encounters/:encounterId
• state transition endpoints:
• POST /encounters/:id/review (`/preceptor-review` remains as a legacy compatibility route)
• POST /encounters/:id/finalize

Offline:
• Show cached encounter
• Edits allowed only if status permits; if server rejects later, show conflict banner

⸻

G) Queues (3 pages)

Routes:
• /queues/drafts
• /queues/review
• /queues/finalize

UI:
• DataGrid columns:
• patient_code, patient name
• createdAt
• key alerts (BP stage, glucose flag)
• status
• action button (continue/review/finalize)

API:
• GET /clinics/:clinicId/encounters?status=DRAFT
• GET /clinics/:clinicId/encounters?status=IN_REVIEW&stage=REVIEW
• GET /clinics/:clinicId/encounters?status=IN_REVIEW&stage=DOCTOR_READY

(If you don’t have stage, derive it via fields preceptorReviewedById etc.)

Offline:
• Show cached queue; display “data may be stale”

⸻

H) Doctor finalize screen (can be inline in encounter detail)

UI:
• Care plan:
• counselingGiven
• medicationPrescribed
• followUpDate (date picker)
• notes
• Finalize action

API:
• PATCH /encounters/:id/care-plan
• POST /encounters/:id/finalize (locks)

Side effect:
• creates reminder if followUpDate exists

⸻

I) Audit viewer (basic)

Route: /audit
UI:
• filters: date range, user, action, entity type, patient_code
• DataGrid: timestamp, actor, action, entity, clinic, requestId

API:
• GET /clinics/:clinicId/audit?from=&to=&action=&actor=&entityId=...
• optional global view for SYSTEM_ADMIN

⸻

J) Clinic settings (Director/Admin)

Route: /settings/clinic
UI:
• research_enabled toggle (per clinic)
• requires_director_approval_each_export toggle
• show “last updated by” + timestamp

API:
• GET /clinics/:clinicId/research/settings
• PUT /clinics/:clinicId/research/settings

⸻

4. Agent execution plan (detailed, parallelizable)

UI Agents

UI-1: App Shell + Auth Bootstrap
• Implement TopBar, SideNav, PageLayout
• Implement whoami bootstrap + clinic selection modal
• Implement SyncStatusPill component wired to IndexedDB outbox and online status
• Implement permission-based nav gating

UI-2: Patients
• /patients list with MUI X grid
• /patients/new form with shadcn components
• Ghana phone input locked
• Duplicate national ID conflict dialog

UI-3: Patient Profile
• /patients/:patientId with tabs (Overview, Encounters, Consent)
• Consent grant/revoke UI + snapshot display

UI-4: Encounters + Wizard
• Encounter create wizard
• Encounter detail view with role-based actions
• Submit/review/finalize controls

UI-5: Queues
• 3 queue pages with DataGrid
• Row click navigates to encounter detail
• Alert badges

UI-6: Audit + Settings
• /audit grid + filters
• /settings/clinic toggles

Backend Agents (if anything is still missing)

API-1: Encounter state machine hardening
• enforce transitions + role permissions
• block edits post-finalize
• structured errors for UI

API-2: Reminder scheduling
• create reminder on finalize when followUpDate exists
• worker + fake SMS provider (dev)
• list reminders endpoint (optional)

API-3: Audit query endpoints
• filtering + pagination
• ensure request_id is included

⸻

5. Future + additional features list (comprehensive backlog)

Clinical modules
• Medications module + external partner integration (Refill)
• Labs orders/results + attachments (MinIO)
• Diagnoses/problem list (ICD)
• Allergies, immunizations
• Longitudinal patient charting (BP trends, glucose trends)

Operations
• Appointments + calendar
• Staff management UI (invite users, assign roles per clinic)
• Clinic reports dashboard:
• HTN/DM incidence
• follow-up adherence
• high-risk cohorts

Research pipeline
• Per-clinic exports with director approval
• De-identification policy UI
• Dataset versioning + revocation propagation
• Export to secure storage (MinIO/S3)
• Analytics sandbox

Communications
• Real SMS provider integration (Twilio or Ghana provider)
• WhatsApp later
• Reminder templates + localization

Platform hardening
• Break-glass access
• Rate limiting + abuse detection
• Data retention + purge policies
• Backups + restore drills
• Observability dashboards and alerts

⸻

6. Implementation “definition of done” for the Basic UI phase

A basic UI phase is complete when:
• Users can login and select clinic
• Patients can be created, searched, viewed
• Encounters can be created and progressed through DRAFT → IN_REVIEW → FINALIZED
• Consent can be granted/revoked
• Offline creation works and sync resolves cleanly
• Queues show correct work items per role
• Audit logs are visible (at least for managers)

⸻

7. Quick alignment question (only one)

For the basic UI, do you want the primary landing page after login to be:
• Patients (search-first clinic workflow), or
• Queues (worklist-first clinic workflow)

Choice: Queues (In the other plan: (UI_AGENTS_PROMPTS.md))
