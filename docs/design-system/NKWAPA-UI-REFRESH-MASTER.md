# Nkwapa — Clinical Workspace UI Refresh

## Master Design and Frontend Implementation Specification

**Project:** Nkwapa — Akomapa Health  
**Design direction:** Layered Clinical Workspace  
**Base branch:** `release/dev`  
**Scope:** Frontend visual presentation, responsive architecture, interaction design, and accessibility  
**Tracking:** Repository-local Markdown documents — no new GitHub issues  
**Primary objective:** Transform the existing interface into a modern, approachable, highly usable clinical application with a distinct native-app-like mobile PWA experience.

---

# 1. Mission

Redesign Nkwapa's user interface to meet the visual and usability standards of professionally engineered healthcare software.

The current application functions, but its visual system relies excessively on similar background colors, hairline dividers, repeated section structures, and subtle interactive controls.

The redesign must introduce:

- A clearer distinction between the application canvas, navigation, content panels, forms, and actionable elements.
- Meaningful visual hierarchy that puts users' next actions first.
- Consistent, recognizable interaction patterns.
- Professional, restrained typography and spacing.
- Better dashboards, clinical workspaces, tables, forms, and patient records.
- Modern, purposeful micro-interactions.
- A distinct mobile and compact-tablet experience that feels like an installed application.
- Better use of available space across devices.
- Consistent states for loading, offline use, saving, validation, and errors.

The goal is not to make Nkwapa look like a generic SaaS dashboard, a collection of shadcn components, or a direct copy of another hospital's software.

**The desired experience is a calm, efficient clinical workspace built for real healthcare operations.**

# 2. Absolute Scope Boundaries

This is a frontend-only redesign.

## Permitted

- CSS and Tailwind changes.
- Refinement of existing design tokens.
- Component styling and composition.
- Frontend presentation components.
- Responsive layout restructuring.
- Navigation presentation changes.
- Accessible interaction and animation improvements.
- Loading and skeleton states.
- Content organization and visual grouping.
- Client-side presentation adapters using existing API data.
- Refactoring duplicated presentational code.
- Frontend tests, screenshots, and documentation.

## Prohibited

- Database schema changes or migrations.
- Backend implementation changes.
- New or modified API contracts and endpoints.
- Changes to business logic or workflow transitions.
- Changes to authentication or permission enforcement.
- Changes to clinic scoping.
- Changes to clinical formulas, classifications, or measurement units.
- Changes to form validation rules or required fields.
- Changes to offline persistence, conflict resolution, or synchronization semantics.
- Changes to research consent or audit behavior.
- Introducing product features that existing APIs do not support.
- Fabricating clinical data, appointments, notifications, or analytics.
- Rebuilding the application from scratch.
- Creating GitHub issues, modifying the old epic, or generating a new issue tree.

Existing behavior remains authoritative. If a desirable UI improvement requires backend work, record it as an out-of-scope dependency rather than implementing it.

# 2A. Mandatory Visual References

**Every agent working on Nkwapa's frontend redesign must consult these references before implementing or substantially modifying any screen.** Read them together with `PROGRESS.md`, `ui-refresh/R0-AUDIT.md` (design decisions, token proposal, motion system) and `ui-refresh/SCREEN-MATRIX.md`, plus any prior evidence for the screen in `ui-refresh/evidence/`, so completed work is not repeated.

The screenshots live in `docs/design-system/ui-refresh/references/` (moved out of `apps/web/public/` on 2026-11-07 so nothing in them can be deployed):

| Folder                   | Purpose                                                                            | In git?                                            | How to use it                                                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-current-ui/`         | Nkwapa's interface before the refresh (volunteer role, desktop)                    | **No, git-ignored.** Contains real patient records | Baseline. Study layout, navigation, type, hierarchy and interaction; decide what to keep. Never copy, crop, cite or upload these images. For shareable "before" shots, capture synthetic data with the route audit harness |
| `02-design-references/`  | A third-party hospital product and other professional software                     | **No, git-ignored.** Third-party product           | Borrow principles only: surface hierarchy, control clarity, dialog composition, status presentation. Never its brand, layouts, imagery or features                                                                         |
| `03-proposed-direction/` | The approved hybrid concepts for desktop, tablet and phone (PNG plus HTML sources) | Yes                                                | **Primary visual direction.** Treat as the intended visual language, not pixel specifications, and adapt them to each role's real workflow                                                                                 |

Citable "before" captures with seeded synthetic data live in `ui-refresh/evidence/r0/before/` (tracked). Use these, never `01-current-ui/`, in docs, PRs and reviews. Regenerate them with the route audit harness and `SHOTS_DIR` (see its config header).

Folders 01 and 02 exist only on the owner's machine. An agent in a fresh clone will not have them: say so in `PROGRESS.md` and work from `R0-AUDIT.md` sections 2 and 3, which summarise both.

Rules for using them:

1. A reference never overrides functional requirements, permissions or existing clinical behaviour. If a concept shows something the API does not support, record it as a decision or an out-of-scope dependency (see `R0-AUDIT.md` section 7).
2. If a referenced image is missing or cannot be opened, write that down in `PROGRESS.md` and work from the documents. Do not describe or invent its contents.
3. The R0 pilot (`ui-refresh/r0-pilot/index.html`) and its screenshots in `ui-refresh/evidence/r0/` show the direction applied to real Nkwapa workflows with synthetic data. Use them as the working reference for R1 onward.
4. **Privacy.** Anything in `apps/web/public/` is served publicly once deployed, so reference and evidence images never go there. Evidence and design artifacts use synthetic data only (codes such as `NKP-DEMO-000117`).

# 3. Existing Project Context

Before implementation, inspect the live repository and its documentation.

Relevant existing resources include:

- `AGENTS.md` and `apps/web/AGENTS.md`
- `docs/design-system/MASTER.md`
- `NKWAPA-2-REDESIGN-MASTER.md`
- `DESIGN-DIRECTION.md`
- `REDESIGN-ROADMAP.md`
- `apps/web/app/globals.css`
- `apps/web/lib/app-nav.ts`
- Existing UI primitives and composed components
- Existing responsive and mobile layouts
- Existing tests, accessibility tooling, and screenshots

The earlier Nkwapa 2.0 program selected a visual language named **Ruled Chart**. That design emphasized exposed rules, continuous surfaces, and minimal card separation.

The new owner-directed design direction supersedes those visual preferences.

Do not undo valid engineering improvements from the previous redesign. Preserve tested components, navigation logic, performance work, accessibility fixes, and shared abstractions.

## Reference interpretation

Study the user-provided ProVita hospital screenshots.

Adopt the following principles:

1. Clear white content surfaces separated from neutral application backgrounds.
2. Purposeful panels with recognizable boundaries.
3. Readable typography and an obvious information hierarchy.
4. Strong primary and secondary button differentiation.
5. Compact but comfortable data tables.
6. Clearly selected tabs and filters.
7. Well-composed contextual dialogs.
8. Task-oriented dashboards.
9. Structured patient detail panels.
10. Helpful status labels, empty states, and next-step actions.

Also consider relevant verified patterns from Cosmos, Aceternity UI, and Design Spells, particularly navigation structure, stateful controls, visual grouping, and meaningful transition feedback.

Do not reproduce ProVita's brand colors, identity, illustrations, hospital photography, payment workflows, prescription features, or layouts literally.

Do not introduce unsupported urgent-arrival workflows, identity verification methods, or other functionality merely because these appear in a reference image.

# 4. Design Language: Layered Clinical Workspace

## 4.1 Surface architecture

Stop using one nearly identical background across the entire application.

Use four major surface levels:

**Level 0 — Application canvas**

A subtle cool-neutral background supporting the main workspace.

**Level 1 — Navigation surfaces**

Clearly differentiated sidebar, header, and mobile navigation areas.

**Level 2 — Primary content surfaces**

White or appropriately themed panels for tables, tasks, forms, charts, and structured information.

**Level 3 — Contextual surfaces**

Dialogs, sheets, popovers, floating toolbars, and focused editing areas.

Use borders, contrast, spacing, and occasional restrained shadows to communicate these layers.

Avoid excessive nesting. A card should not automatically contain several smaller cards simply for decoration.

## 4.2 Proposed light-mode palette

These are starting candidates, not accessibility-verified final values.

| Token               | Candidate |
| ------------------- | --------- |
| App canvas          | `#F4F7F7` |
| Primary surface     | `#FFFFFF` |
| Secondary surface   | `#F7F9F9` |
| Selected surface    | `#E5F2F1` |
| Brand teal          | `#008BA1` |
| Primary action teal | `#00778A` |
| Brand gold          | `#FFCD1A` |
| Primary text        | `#1D2930` |
| Muted text          | `#5C6970` |
| Structural border   | `#DDE6E5` |

Retain the existing Nkwapa brand identity.

Gold should be used sparingly, for meaningful highlights and brand accents, not as a substitute for clinical severity colors.

Maintain separate semantic tokens for workflow status, warning, critical values, success, failure, and synchronization.

Never use color as the only signal.

## 4.3 Dark mode

Create a real dark surface hierarchy using neutral charcoal or deep slate backgrounds.

Do not simply invert the light theme.

Inputs, selected states, borders, patient measurements, and warning indicators must remain clearly distinguishable.

All critical screens must be visually reviewed in both supported themes.

## 4.4 Typography

Retain **IBM Plex Sans** and **Source Serif 4** as the foundation.

Use IBM Plex Sans for clinical application content:

- Navigation and toolbars
- Forms and labels
- Tables
- Patient details
- Measurement values
- Dialogs
- Buttons
- Status labels

Use Source Serif 4 selectively for major page titles and editorial elements where appropriate.

Avoid mixing serif and sans-serif inside a single table or clinical measurement group without a deliberate reason.

Use consistent type roles, approximately:

| Role             | Target  |
| ---------------- | ------- |
| Page title       | 26–30px |
| Section heading  | 18–22px |
| Primary content  | 14–16px |
| Field label      | 13–14px |
| Metadata         | 12–13px |
| Prominent metric | 28–36px |

These values are starting points and must accommodate text zoom, mobile width, accessibility, and actual content density.

Apply tabular numerals to measurements, dates, times, and relevant numeric columns.

## 4.5 Spacing and geometry

Use a coherent spacing scale rather than independent values for every page.

Suggested starting points:

- No squircles (owner direction, 2026-11-07). Tags 4px, buttons and inputs 6px, objects such as tickets and readouts 8px, the workspace sheet and dialogs 12px, the top edge of a phone bottom sheet 14px.
- Circles only for avatars, status dots and station stops.
- Do not wrap sections in white cards; separate them with hairlines and space on the workspace sheet (R0-AUDIT section 8.2).
- Desktop content spacing: approximately 20–28px.
- Mobile page gutters: approximately 16px.
- Minimum preferred touch area: 44 × 44 CSS pixels.
- Comfortable form control height: approximately 44–48px.

Avoid huge blank vertical gaps between related content.

Maintain clean alignment, consistent panel padding, and deliberate grouping.

# 5. Interaction and Component Standards

## 5.1 Buttons

Establish a consistent action system.

**Primary:** Filled teal, high contrast, obvious label.

**Secondary:** White or neutral fill with a visible border.

**Tertiary:** Quiet text or icon action, used only where intent is understandable.

**Destructive:** Explicit, clearly labeled, and used only where appropriate.

**Disabled:** Visibly unavailable but distinguishable from read-only content.

Every interactive component must support its applicable states:

- Default
- Hover
- Pressed
- Keyboard focus
- Selected
- Disabled
- Loading
- Success
- Error

Buttons must never look like ordinary text merely because they are secondary actions.

Avoid relying on icon-only controls for important clinical actions. If used, provide accessible labels and tooltips where appropriate.

## 5.2 Inputs

Forms must have:

- Visible labels.
- Clear control borders.
- Appropriate field grouping.
- Helpful descriptions when necessary.
- Clear required and optional indicators.
- Visible error messages.
- Strong focus states.
- Correct input types and keyboard behavior.
- Consistent validation presentation.

Do not use placeholder-only labels.

## 5.3 Tabs

Use segmented controls for mutually exclusive view filters, such as Day/Week or Current/Past.

Use real navigation tabs for substantial record sections.

Always make the active tab visually obvious.

Use short active-state transitions where beneficial, without distracting content animation.

## 5.4 Dialogs and sheets

Model the clarity of the supplied ProVita dialogs:

- Clear purpose in the title.
- Concise contextual explanation.
- Logically grouped fields.
- Relevant patient or encounter context.
- Strong confirmation action.
- Clear cancel or close action.
- Safe handling of unsaved changes.
- Accessible focus management.

For mobile, prefer full-width bottom sheets or full-screen forms when a centered desktop dialog would become cramped.

Do not automatically turn every small popover into a fullscreen experience.

## 5.5 Tables and lists

Use the existing table infrastructure.

Desktop tables should provide:

- Clear header contrast.
- Comfortable row height.
- Well-aligned numeric columns.
- Readable patient identification.
- Meaningful statuses.
- Clear action columns.
- Row hover and focus states.
- Consistent sorting and pagination.
- Appropriate empty and error states.

Do not make the entire row clickable if it contains conflicting actions without implementing accessible and unambiguous interaction.

On mobile, selectively replace tables with structured list items or record cards.

Preserve sorting, pagination, filtering, and record actions through the existing interfaces.

# 6. Adaptive App Architecture

**Nkwapa must not be a desktop page compressed to fit a phone.**

It must have multiple presentation modes while using the same application logic and data.

## 6.1 Initial layout breakpoints

| Width            | Presentation mode                   |
| ---------------- | ----------------------------------- |
| 320–599px        | Phone workspace                     |
| 600–839px        | Compact tablet / foldable workspace |
| 840–1199px       | Tablet workspace                    |
| 1200px and above | Desktop workspace                   |

These are initial targets, not assumptions about device models.

Use container queries where local component space matters more than viewport width.

Prefer CSS-driven layout adaptation. Use JavaScript media-query logic only when behavior genuinely changes.

Never use user-agent detection to determine the UI.

Test intermediate widths and browser zoom.

## 6.2 Desktop workspace

Design for clinical staff using laptops and desktop computers.

Structure:

- Persistent, collapsible sidebar.
- Compact top header.
- Active clinic and role context.
- Clearly visible synchronization status.
- Neutral content canvas.
- Distinct white workspace panels.
- Efficient table and chart layouts.
- Contextual side panels where useful.

The sidebar should remain labeled in its default expanded state.

Navigation density should be reasonable without hiding essential destinations.

## 6.3 Tablet workspace

Tablets should be purposefully composed, not merely scaled-up phones.

Depending on usable width:

- Compact navigation rail or bottom navigation.
- Two-column content where appropriate.
- Touch-friendly actions.
- Adapted patient details and clinical forms.
- Full-width tables only when genuinely readable.
- Contextual sheets instead of cramped popovers.
- Comfortable landscape and portrait layouts.

An iPad mini in portrait may use the compact-tablet shell; in landscape it may use the tablet shell.

The transition must be determined by available space, not the device name.

## 6.4 Phone workspace — Native-app-like PWA

Build a distinct phone presentation using the same application.

### App shell

- Compact top header with screen title and contextual actions.
- Persistent bottom navigation for major destinations where suitable.
- One clearly highlighted active destination.
- A More destination for less-frequent areas.
- Bottom safe-area support.
- Correct notch and display-cutout handling.
- Full-height layouts using modern viewport units.
- Proper behavior with the virtual keyboard.
- No horizontal document overflow.

### Bottom navigation

For staff roles, derive destinations from the existing permission-filtered navigation.

The destinations should reflect each role's actual tasks.

Examples:

- Volunteer: Home, Stations, Patients, Appointments, More.
- Doctor: Home, Review/Work, Patients, Appointments, More.
- Manager: Today, Queues, Patients, Staff/Operations, More.

These are proposed presentations, not new routes or permission definitions.

Use only destinations already supported and authorized by the application.

For patients, use a simpler navigation focused on Home, Health, Appointments, and More, adapted to existing portal capabilities.

### Mobile interaction patterns

- Replace wide tables with task-focused list cards where appropriate.
- Use large touch-friendly controls.
- Put primary actions near the current task.
- Use sticky bottom action bars for long forms where safe.
- Use bottom sheets for relevant filters and contextual actions.
- Use clear Back navigation and persistent screen context.
- Show concise section summaries before expanded details.
- Avoid hover-dependent interactions.
- Avoid swipe-only critical actions.
- Keep clinical values and their units visible.
- Keep offline and sync status accessible at all times.

### Foldables and dual-screen devices

Support narrow and expanded foldable layouts gracefully.

Where supported, account for viewport segments and hinges so important controls and text are not placed across a physical gap.

Ensure the interface remains usable when segment-specific APIs are unavailable.

Do not create a device-specific codebase.

## 6.5 Shared architecture

Prefer one shared data-fetching and state-management layer with adaptive presentation components.

For example, the same patient results should power:

- A desktop data table.
- A tablet compact table or two-column list.
- A mobile patient card list.

Do not duplicate network requests, clinical form state, permission logic, validation, or persistence simply to support different screen layouts.

Preserve React state across responsive transitions where practical, particularly while clinical forms are being completed.

# 7. Screen-by-Screen Redesign Requirements

## 7.1 Volunteer Dashboard

This should be a **work-first dashboard**, not primarily an analytics report.

Suggested desktop composition:

**Header:** Active clinic, current role, relevant date, refresh.

**Primary workspace:** Needs your attention — current shift, station, next patient, outstanding draft encounters, or other existing work items.

**Secondary workspace:** Today's activity summary, active workflow context, and pending work.

**Supporting information:** Existing trends and historical metrics in a visually lower-priority area.

Use cards selectively for important individual metrics and grouped work.

Avoid making five identical KPI cards the dominant visual feature.

On mobile, prioritize the next actionable task with a prominent button, followed by a concise worklist and a compact summary.

Do not invent assignments or counts not available from existing APIs.

## 7.2 Stations

Stations is one of Nkwapa's most important daily-use screens.

Desktop:

- Clearly distinct Shift Status panel.
- Prominent assigned/selected station information.
- Large, obvious Start Shift or End Shift action.
- Readable station queue.
- Clear next-patient context.
- Visually grouped station overview.
- No unnecessary empty columns when a shift has not started.

Mobile:

- Start Shift panel near the top when off duty.
- Station selection in a straightforward list or sheet.
- Selected station becomes the main workspace.
- Next patient appears as a prominent action-oriented record.
- Other stations remain accessible through a secondary view.
- Clinical data-entry flows use focused, single-column layouts.

Preserve existing shift, assignment, station, and queue semantics.

## 7.3 Queues

Create a cleaner queue workspace with strong differentiation between workflow stages.

Desktop:

- Distinct queue or stage selector.
- Clear counts.
- Search and filtering where already supported.
- Professional table layout.
- Action-oriented rows.
- Clinical status and relevant measurements visible without overwhelming the table.

Mobile:

- Stage selector at the top.
- Compact queue record cards.
- Patient identification, time, stage, and relevant clinical flags.
- A clear Open/Continue/Review action appropriate to the user's role.

Keep clinical risk classifications separate from encounter workflow statuses.

A Stage 1 BP label should not automatically receive the same visual urgency as a crisis classification.

## 7.4 Patient Registry

Reduce the current vertical cost of search and filtering.

Desktop:

- Strong patient search field.
- Basic filters in a compact toolbar.
- Expandable advanced filters.
- Clearly separated results panel.
- Comfortable table density.
- Distinct View and Check In actions.
- Consistent pagination.

Mobile:

- Full-width search.
- Filter button opening a sheet.
- Active filter count and removable chips.
- Patient cards or compact rows.
- Name and patient code immediately readable.
- Relevant secondary details.
- Explicit actions without relying on row hover.

Preserve clinic scoping, search contracts, masking, sorting, and pagination.

## 7.5 New Patient Registration

Transform the long form into a more approachable registration experience.

Desktop:

- Comfortable maximum content width.
- Clear Identity, Contact, Location, and other existing sections.
- Consistent field spacing.
- Appropriate explanatory text.
- Visible errors near fields.
- A stable save action area.

Mobile:

- Focused, single-column form.
- Distinct grouped sections.
- Collapsible or progressive sections where this improves usability.
- Sticky action area where safe.
- Correct mobile keyboards.
- Accessible date and selection controls.
- Clear duplicate-patient dialogs.

Progressive presentation must not alter the data-save lifecycle or existing validation.

Never discard form data during navigation or breakpoint changes.

## 7.6 Patient Profile

Replace the long, visually repetitive overview with a deliberate chart workspace.

Header:

- Patient name and code.
- Appropriate demographic context.
- Relevant consent and encounter status.
- Clear Check In or active encounter action when permitted.

Use grouped navigation for:

- Overview
- Clinical information
- Vitals and screening
- Encounters
- Notes and history
- Consent and administrative information

These groupings must map to existing tabs and routes; do not remove data.

Desktop:

- A concise patient summary area.
- Actionable outstanding items.
- Clinically relevant measurements.
- Recent encounter context.
- Meaningful supporting panels.

Mobile:

- Compact patient identity header.
- Quick action area.
- Scrollable or menu-based section navigation.
- Clinical summary cards.
- Expandable supporting details.

Maintain clinical provenance, timestamps, units, and draft/finalized distinctions.

## 7.7 Vitals and Longitudinal Trends

Use existing Recharts or equivalent project infrastructure.

- Show the latest value clearly.
- Include units.
- Use meaningful chart scales.
- Retain real timestamps.
- Label readings and source appropriately.
- Provide accessible table alternatives.
- Avoid misleading animation or interpolated clinical values.
- Distinguish no data, loading, and failure.

On phones, charts must use the available width without clipping or illegible axes.

Use compact metric summaries rather than oversized blocks containing a single value.

## 7.8 Appointments

Borrow the supplied reference's clarity in calendar controls, appointment summaries, and scheduling dialogs.

Desktop:

- Strong date navigation.
- Clear Day/Week selection.
- Compact filter toolbar.
- Readable schedule panel.
- Distinct appointment-request section.
- Consistent appointment statuses.

Mobile:

- Short date strip or compact date navigation.
- Agenda-first list.
- Appointment cards showing patient, time, status, and authorized actions.
- Sheets or fullscreen forms for existing scheduling actions.

Do not add time slots, rescheduling capabilities, or calendar interactions unsupported by existing APIs.

Preserve Africa/Accra time handling and existing scheduling semantics.

## 7.9 Clinical Encounters and Doctor Review

Design around the clinician's current decision and responsibility.

- Keep patient identity and encounter status visible.
- Group measurements, screening data, history, and notes logically.
- Make outstanding review items obvious.
- Use contextual actions for existing sign-off and finalization steps.
- Provide clear read-only states.
- Preserve clinical provenance and corrected values.
- Avoid hiding important findings behind unnecessary navigation.

On mobile, use a structured sequence with sticky contextual navigation or action areas where safe.

Finalization must remain a deliberate, understandable action.

## 7.10 Manager, Director, and Administrator Views

Use the same foundation with role-appropriate information density.

Manager:

- Today's operations.
- Station and patient flow.
- Staffing and assignments.
- Operational exceptions.
- Review and completion progress.

Director:

- Clinic oversight.
- Existing reporting.
- Follow-up and workflow metrics.
- Authorized governance actions.

Administrator:

- Clinic and user administration.
- Permission-related management.
- Existing audit and governance tools.
- Data quality and operational status.

Use more compact tables and analytic panels where these roles need them.

Avoid forcing the volunteer dashboard composition onto oversight roles.

## 7.11 Patient Portal

The patient portal should feel simpler and more personal than the staff workspace.

Prioritize:

- Next appointment.
- Relevant health information.
- Existing measurements and trends.
- Follow-up actions.
- Patient-reported information.
- Clear plain-language statuses.

Adopt the lighter, approachable qualities of the ProVita patient dashboard without copying its unrelated clinical modules.

The mobile portal should use large action cards, concise summaries, and straightforward navigation.

Do not expose staff-only actions or information.

## 7.12 Authentication and Public Pages

Bring existing login, account activation, invitation, and related presentation into the same visual family.

Use restrained, recognizable branding and clear form hierarchy.

Do not change Keycloak security, identity-verification requirements, session behavior, or authorization.

The public Nkwapa site may receive visual consistency improvements as a separately scoped frontend unit after critical clinical surfaces are complete.

# 8. Feedback, Offline, and Error States

Treat all system states as intentional designs.

## Loading

Use stable skeletons where appropriate and avoid misleading blank content.

## Empty

Communicate why information is absent and offer an existing next action when useful.

## Error

Present understandable messages with safe retry or recovery actions.

## Offline

Distinguish:

- Working online.
- Offline with local work available.
- Saved locally and pending synchronization.
- Synchronization in progress.
- Synchronization successful.
- Conflict or failed synchronization.

A locally saved clinical record must not be labeled as server-synced until synchronization actually succeeds.

The mobile shell must retain access to pending-sync information.

Preserve all existing offline and conflict behavior.

# 9. Motion and Micro-Interactions

Motion must improve comprehension, not decorate the application.

Use restrained transitions for:

- Button feedback.
- Tab selection.
- Navigation drawers.
- Modal and sheet opening.
- Loading indicators.
- Workflow progression.
- Confirmation feedback.
- Chart transitions where clinically faithful.

Suggested starting durations:

- Immediate control feedback: 100–150 ms.
- Small state changes: 150–200 ms.
- Sheets and navigation panels: 180–250 ms.

Use the existing Motion/Framer Motion and CSS capabilities when appropriate.

Do not introduce new animation dependencies without a specific need.

Avoid:

- Continuous decorative movement.
- Animated background gradients.
- Bouncing controls.
- Scroll-jacking.
- Hover scaling that changes layout.
- Excessive card entrance animations.
- Motion that delays clinical tasks.

Respect `prefers-reduced-motion`.

Never use animation to obscure a status transition or indicate successful persistence prematurely.

## 9.1 Motion principles (owner-approved, applies to all future sessions)

The full mapping, with where each principle applies in Nkwapa and its exact values, is in `ui-refresh/R0-AUDIT.md` section 6. In short:

1. Ease-out for entrances; ease-in-out for things already on screen that move.
2. Dropdowns and popovers: 150 to 250ms, start at scale 0.95, grow from the trigger and exit back to it.
3. Exits are 20% shorter than entrances (200ms in, 160ms out; sheets 240ms in, 190ms out).
4. Stagger list rows by 30ms on first render only, capped at 6 rows. Stagger details as a panel settles.
5. Press feedback: scale 0.97. Moving knobs and segment indicators may stretch up to 12% in the direction of travel.
6. No bounce on everyday UI. Do not tween while the user is holding or dragging; follow the finger, animate after release. Rubber band past bounds on draggable sheets.
7. Overlap old and new states (crossfade) instead of blanking between them. Use masks for reveals and colour changes, and crossfade icon swaps with a small blur.
8. Arcs only for objects moving freely across the screen. Reuse the same element across layouts (shared layout animation) rather than removing and re-adding it.
9. A success pulse confirms only what actually happened: a local save says it is on this device and waiting to sync.
10. Added in R0: never animate clinical numbers; nothing animates on actions repeated many times a day; transitions stay interruptible; transform and opacity only; hover effects only on devices that hover; tooltips skip their delay once one is open.

# 10. Accessibility and Clinical Usability

Target WCAG 2.2 AA.

Validate:

- Contrast.
- Keyboard access.
- Focus visibility.
- Dialog focus handling.
- Accessible control names.
- Label associations.
- Screen-reader announcements.
- Touch target sizing.
- Text zoom and reflow.
- Reduced motion.
- Orientation changes.
- Mobile virtual keyboard behavior.
- Accessible data tables and charts.
- Error messages.
- Critical status visibility.

All clinical information must remain understandable without relying on color alone.

On smaller screens, do not hide critical patient identity, clinical measurements, validation messages, or necessary actions merely to make the layout visually cleaner.

# 11. Engineering Strategy

Use the existing Next.js, React, Tailwind, shadcn/Radix, table, chart, and test infrastructure.

Verify current versions instead of relying on historical documentation.

Build on existing components wherever possible.

Recommended architectural separation:

1. Semantic design tokens.
2. Shared interface primitives.
3. Shared composition components.
4. Adaptive application shells.
5. Presentation-only responsive variants.
6. Existing data hooks and application state.
7. Existing API clients and business logic.

The mobile and desktop views must consume the same authorized data and business rules.

Prefer CSS/container-query adaptation where possible.

Avoid device sniffing, duplicate request effects, parallel state machines, duplicated form validation, and excessive client-side rendering.

Do not use remote font, motion, or UI dependencies in critical clinical workflows unless explicitly justified.

# 12. Implementation Phases

This is a new visual refinement program, not a reopening of the previous GitHub epic.

## Phase R0 — Audit and Design Pilot

- Inspect the current repository.
- Identify reusable components and design debt.
- Review the uploaded screenshots.
- Audit existing mobile layouts.
- Establish a visual baseline.
- Select the Layered Clinical Workspace direction.
- Produce representative desktop, tablet, and phone designs.
- Validate the direction on a dashboard, patient list, and station or encounter workspace.

**Exit condition:** The proposed design is coherent across desktop and phone and preserves the essential clinical workflow.

## Phase R1 — Design Foundation

- Semantic surfaces.
- Typography hierarchy.
- Buttons and inputs.
- Borders and radii.
- Tabs, badges, and dialogs.
- Table styles.
- Loading and feedback states.
- Dark-mode variants.

**Exit condition:** Shared components form a visually coherent and accessible foundation.

## Phase R2 — Adaptive App Shell

- Desktop sidebar and header.
- Tablet navigation.
- Phone top bar.
- Bottom navigation.
- Mobile sheets.
- Safe-area handling.
- Role-driven destinations.
- Synchronization visibility.

**Exit condition:** Navigation is usable across roles and device widths without changing permissions.

## Phase R3 — Core Volunteer and Clinical Workflow

- Volunteer dashboard.
- Stations.
- Queues.
- Patient registry.
- Registration.
- Patient profile.
- Vitals and screening.
- Encounters.

**Exit condition:** End-to-end volunteer workflows remain functional, including offline scenarios.

## Phase R4 — Clinical Review and Oversight

- Doctor.
- Preceptor.
- Manager.
- Director.
- System Administrator.
- Existing clinical review workflows.
- Staff and clinic administration.
- Analytics and reporting.

**Exit condition:** Role-specific workspaces are consistent without losing their unique information needs.

## Phase R5 — Patient Portal and Authentication

- Patient portal.
- Patient measurements.
- Appointments.
- Existing patient actions.
- Authentication-related visual screens.

**Exit condition:** Patient-facing experiences are simpler, responsive, secure, and consistent.

## Phase R6 — Supporting Public Experience

- Public landing page.
- Supporting public pages.
- Navigation and footer consistency.
- Product visual storytelling where appropriate.

Keep this phase independent of critical staff workflows.

## Phase R7 — Interaction and Visual Refinement

- Motion review.
- Keyboard and focus polish.
- Forms and modal refinements.
- Responsive edge cases.
- Error and empty-state improvements.
- Dark-mode pass.
- Performance checks.

## Phase R8 — Final QA and Release Preparation

- Full route audit.
- Device and breakpoint matrix.
- Role-based navigation tests.
- Clinical workflow regression.
- Offline and sync regression.
- Visual regression.
- Accessibility checks.
- Performance review.
- Documentation and handoff.

# 13. Progress Tracking Without GitHub Issues

Do not create new GitHub issues or update the old epic for this refresh.

Use repository-local Markdown progress documents.

Recommended structure:

```text
docs/design-system/ui-refresh/
  MASTER.md
  PROGRESS.md
  SCREEN-MATRIX.md
  DECISIONS.md
  QA-REPORT.md
  evidence/
```

Reuse existing documentation equivalents when that avoids duplication.

As built in R0: this file and `docs/design-system/PROGRESS.md` stay where they are; `docs/design-system/ui-refresh/` holds `R0-AUDIT.md` (decisions and rationale), `SCREEN-MATRIX.md`, `r0-pilot/` and `evidence/`.

Maintain:

- Phase status.
- Screens completed by viewport.
- Shared component progress.
- Decisions and rationale.
- Test evidence.
- Before/after screenshots.
- Known limitations.
- Git commit or PR reference where applicable.
- Next implementation task.

Use small branches from `release/dev` and focused PRs for review, without requiring issue references.

Do not use a single enormous implementation branch.

Do not overwrite historical redesign records.

# 14. Definition of Done

A redesigned screen is complete only when:

1. Its visual hierarchy has meaningfully improved.
2. It follows the approved design tokens.
3. Buttons and controls are unmistakably interactive.
4. It supports all relevant breakpoints.
5. Mobile presentation is deliberately composed.
6. Light and dark modes work where supported.
7. Keyboard and touch navigation work.
8. Existing role permissions are unchanged.
9. Existing API contracts remain unchanged.
10. Existing offline behavior remains intact.
11. No clinical validation or data semantics have changed.
12. Relevant tests pass.
13. Screenshots have been reviewed.
14. Progress documentation is updated.
15. The change has been reviewed against the rest of the product.

Do not mark a screen complete solely because it renders successfully or looks attractive in a desktop screenshot.

# 15. First Agent Directive

Begin with the existing repository and all relevant documentation.

Do not scaffold a new application or blindly replace components.

First, complete Phase R0:

- Audit the actual current frontend.
- Identify which earlier redesign work can be retained.
- Identify visual inconsistencies.
- Document the current responsive architecture.
- Prepare a concrete design-token proposal.
- Produce representative layouts for desktop, iPad mini portrait/landscape, and narrow phones.
- Demonstrate the new direction through real Nkwapa workflows, not generic dashboard mockups.
- Record the implementation plan in the progress tracker.

Present a focused design checkpoint before starting the app-wide component and page transformation.

After the direction is accepted, implement phases in small, testable units and keep the repository tracker current.

**Success means that Nkwapa looks and behaves like one professionally designed clinical product across laptops, tablets, and phones, without changing the application underneath.**
