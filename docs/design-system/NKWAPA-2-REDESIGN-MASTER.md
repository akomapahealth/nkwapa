# NKWAPA 2.0 — MASTER PRODUCT REDESIGN & IMPLEMENTATION SPECIFICATION

## Mission: Complete Product-Wide UI/UX Transformation

You are acting as a multidisciplinary senior engineering and product design team responsible for transforming Nkwapa into a modern, beautiful, accessible, efficient, production-grade clinical management platform.

You must operate as:

- Principal Product Designer
- Senior UI/UX Engineer
- Design Systems Architect
- Senior Next.js / React Engineer
- Clinical Workflow UX Specialist
- Frontend Accessibility Engineer
- Performance and Responsive Design Engineer
- Software QA / Test Automation Engineer
- Technical Project Manager
- Design Quality Reviewer

This is not a cosmetic redesign.

It is a comprehensive, carefully engineered transformation of Nkwapa's entire user experience.

The objective is to achieve the visual quality, refinement, consistency, usability, and attention to detail seen in leading modern healthcare and productivity products, while preserving Nkwapa's established identity, clinical workflows, security architecture, offline capabilities, and functional behavior.

We are not cloning Heidi Health or any other product.

We are developing an original Nkwapa design language informed by exceptional examples of modern product design.

---

# PART I — PROJECT CONTEXT

## 1. Project Information

**Product:** Nkwapa

**Website:** https://nkwapa.app

**Organization:** Akomapa Health

**Organization website:** https://akomapa.org

**Repository:** https://github.com/akomapahealth/nkwapa

**Primary epic:** https://github.com/akomapahealth/nkwapa/issues/229

**Base development branch:** `release/dev`

**Project type:** Electronic Medical Records / Patient Management / Clinical Workflow Platform

**Initial clinical focus:**

- Hypertension
- Diabetes
- Noncommunicable disease screening
- Patient registration
- Vital signs
- Clinical encounters
- Doctor review
- Follow-up coordination
- Community health screenings

**Primary deployment context:** Clinics and community healthcare operations in Ghana, with potential future expansion.

### Product reality

Nkwapa is not a generic SaaS dashboard.

It supports actual clinical activity, including situations where:

- Volunteers register patients.
- Multiple healthcare workers screen the same patient.
- Vital signs are captured at different stations.
- Doctors review patient records and clinical encounters.
- Managers oversee screening operations.
- Patient care requires follow-up.
- Internet connectivity may be slow, intermittent, or unavailable.
- Different roles have different permissions.
- Patient information must be kept secure and confidential.

Every design decision must respect this environment.

## 2. Existing Work

The project already has substantial functionality, infrastructure, reusable components, and an established design system.

Do not assume the codebase is empty.

Do not scaffold a new application.

Do not rewrite the frontend from scratch.

Do not replace working libraries or frameworks merely because alternatives are fashionable.

Study the implementation carefully and preserve what works.

### Important existing documentation

Read the following before making changes:

- `AGENTS.md`, wherever applicable
- `apps/web/AGENTS.md`
- `docs/design-system/MASTER.md`
- `apps/web/lib/app-nav.ts`
- `apps/web/components.json`
- `apps/web/app/globals.css`
- Existing Tailwind configuration
- Existing component architecture
- Existing route definitions
- Existing E2E tests
- Existing CI workflows
- Epic #229
- Relevant related GitHub issues

Explore the repository for additional architecture and engineering documentation.

The existing documentation is authoritative for current implementation behavior. If this master prompt conflicts with actual repository state, investigate and document the discrepancy.

Do not silently override established constraints.

## 3. Existing Technology Stack

At the time of epic #229, the documented stack included:

- Next.js 16.3.0 canary
- React 18.3
- Tailwind CSS 3.4
- TypeScript
- shadcn/ui, New York style
- Radix UI primitives
- Lucide React
- Framer Motion 12
- Recharts 3
- TanStack Table
- Sonner 2
- Playwright
- Existing accessibility testing
- Existing token-based styling
- Existing role and permission architecture

Verify the versions actually installed before implementation.

The repository may have changed since these were documented.

### Dependency policy

Do not upgrade Next.js, React, Tailwind, or major UI dependencies as part of an unrelated visual redesign.

If an upgrade is genuinely required, document:

1. Why it is necessary.
2. Which components depend on it.
3. Compatibility risks.
4. Migration effort.
5. Test requirements.
6. Rollback strategy.

Propose such an upgrade as a separate issue.

Never introduce new dependencies without evaluating what the existing stack already provides.

---

# PART II — DESIGN REFERENCES & INSPIRATION

## 4. Primary Design Reference: Heidi Health

Study:

https://www.heidihealth.com/en-us

Analyze both:

1. The public marketing website.
2. The authenticated application screenshots supplied with this assignment.

The screenshot references include:

- Sessions workspace
- AI evidence/chat workspace
- Task management
- Clinical document editor
- SOAP note template
- H&P template
- Marketing hero
- Product features
- Testimonials and social proof
- Footer
- Editorial typography
- Color treatments
- Interaction patterns

### Important

Use these as references for design quality, not templates to copy.

Do not reproduce Heidi's logo, branding, layouts pixel-for-pixel, illustrations, custom fonts, or proprietary assets.

Instead, identify and adapt the underlying design principles.

## 5. Heidi Design Characteristics

The reference design demonstrates:

### Editorial typography

Large, expressive serif headings paired with highly readable sans-serif interface typography.

### Warm neutral surfaces

Warm white and sand-colored backgrounds instead of stark gray and blue SaaS styling.

### Carefully controlled accent colors

Bright accents used sparingly and intentionally.

### Exceptional whitespace management

Elements have room to breathe without leaving large areas functionally empty.

### Refined information hierarchy

Important content is immediately identifiable.

### Minimal interface chrome

Borders, shadows, and nested containers are used only when needed.

### Compact application navigation

Navigation does not unnecessarily consume the workspace.

### Contextual editing

Controls are located close to the information or workflow they affect.

### Thoughtful empty states

Empty states are restrained, contextual, and informative.

### Intentional product storytelling

The marketing website explains the user problem, demonstrates the product, and communicates its value through real context.

### Purposeful animation

Motion enhances navigation and comprehension rather than distracting from tasks.

## 6. Design Extraction Tools

Evaluate and use appropriate tools to research the reference design.

Suggested tools:

- Dembrandt: https://github.com/dembrandt/dembrandt
- Browser DevTools
- Playwright
- TraceUI: https://traceui.dev/tools
- Design Snap: https://designsnap.dev/

Dembrandt is a preferred option for structured design-token extraction if it is compatible with the environment.

Use tools to inspect:

- Typography
- Font families and weights
- Letter spacing
- Line heights
- Color values
- Spacing
- Border radii
- Borders and shadows
- Button styles
- Input treatments
- Navigation dimensions
- Responsive behavior
- Hover and focus states
- Motion and easing
- Section composition
- Design tokens

Never present an inferred value as an officially verified value.

Separate observations into:

- Officially documented
- Browser-measured
- Screenshot-estimated
- Proposed for Nkwapa

Authenticated Heidi screens should be analyzed from the supplied screenshots unless an authorized session is available.

Do not attempt to bypass authentication.

## 7. Additional Design References

Evaluate relevant patterns from:

- shadcn/ui: https://ui.shadcn.com/
- Radix UI: https://www.radix-ui.com/
- React Bits: https://reactbits.dev/
- Kokonut UI: https://kokonutui.com/
- Bklit UI: https://bklit.com/
- Motion: https://motion.dev/
- Emil Kowalski animations: https://animations.dev/
- Impeccable: https://impeccable.style/

Also examine other well-designed healthcare, productivity, and professional workflow tools when beneficial.

Do not blindly copy their visual systems.

The outcome must be a consistent Nkwapa identity.

---

# PART III — REQUIRED DESIGN SKILLS

## 8. Impeccable Skill

You must actively use the installed **Impeccable skill** wherever applicable.

Locate and read its actual instructions before starting design work.

Do not merely mention Impeccable in the final report.

Apply its principles throughout:

- Design critique
- Layout composition
- Typography
- Visual hierarchy
- Color treatment
- Spacing
- Alignment
- Accessibility
- Responsive design
- Component consistency
- UI polishing
- Visual QA

Use the relevant Impeccable workflows or commands supported by the installed version.

If the skill is not installed, report that clearly and continue with the documented design-quality requirements rather than inventing its behavior.

## 9. Taste Skill

You must also actively use the installed **Taste skill** or `taste-skill`, where available.

Locate its actual instruction file and understand its design principles.

Use Taste during:

1. Initial design exploration.
2. Design direction selection.
3. Component design.
4. Page implementation.
5. Visual refinement.
6. Final screenshot reviews.

The objective is to create a distinctive, polished product rather than conventional AI-generated UI.

Taste should help identify:

- Weak composition
- Generic visual patterns
- Inconsistent density
- Unnecessary cards
- Awkward spacing
- Weak typographic rhythm
- Unbalanced visual weight
- Excessive decoration
- Poor interaction feedback

Do not allow Taste-driven visual changes to override clinical usability, accessibility, or established design tokens.

## 10. Emil Kowalski's Animation Principles

Apply the motion and interaction-design principles taught by Emil Kowalski.

Use existing Motion/Framer Motion or CSS animation primitives where appropriate.

Focus on:

- Natural easing
- Meaningful feedback
- Subtle transitions
- Responsive interactions
- Appropriate durations
- Correct transform origins
- Layout continuity
- Accessible motion
- Reduced-motion support

Avoid:

- Unnecessary spring animations
- Excessive bouncing
- Animating every card on load
- Scroll-jacking
- Continuous decorative motion
- Heavy parallax in clinical workflows
- Animations delaying important actions

Clinical interfaces should remain calm and predictable.

## 11. Mandatory Design Review Loop

At the end of every significant design implementation:

1. Capture screenshots.
2. Review with Impeccable.
3. Review with Taste.
4. Evaluate interaction behavior.
5. Check accessibility.
6. Compare with the approved design direction.
7. Identify weaknesses.
8. Refine.
9. Retest.
10. Document the result.

The first visually working version is not automatically finished.

Do not stop at a design simply because it compiles.

---

# PART IV — NKWAPA'S BRAND IDENTITY

## 12. Preserve Nkwapa's Identity

The current approved logo uses:

**Logo teal:** `#008BA1`

**Logo gold:** `#FFCD1A`

The existing design system defines an accessible primary action teal:

`#00778A`

Additional established values include:

- Main canvas: `#FCFBF3`
- Main ink: `#1D2930`
- Warm card: `#FCFBF8`
- Sidebar: `#D7EAE0`
- Secondary text: `#5C6970`

These values are starting points and are documented in `docs/design-system/MASTER.md`.

The design system contains accessibility reasoning for these values.

Do not arbitrarily replace them.

Do not introduce Heidi's burgundy/yellow branding as Nkwapa's identity.

## 13. Typography

Nkwapa's existing system uses:

- Source Serif 4
- IBM Plex Sans

Preserve these as the initial typography foundation.

Explore a more polished typography hierarchy before considering replacements.

### Marketing typography

Use expressive serif typography for:

- Major headlines
- Feature headings
- Editorial storytelling
- Testimonials
- Important section introductions

Use readable sans-serif typography for:

- Body copy
- Navigation
- Buttons
- Supporting explanations
- Forms

### Clinical application typography

Favor IBM Plex Sans for:

- Navigation
- Tables
- Patient data
- Forms
- Clinical measurements
- Labels
- Status indicators
- Toolbars

Use Source Serif 4 selectively for major page titles or editorial moments.

Do not use serif typography for dense measurement grids or critical form controls.

Use tabular numerals where appropriate.

Do not introduce multiple unrelated font families.

## 14. Desired Visual Language

The target identity is:

**Modern Clinical Editorial**

It should feel:

- Modern
- Professional
- Warm
- Human-centered
- Distinctive
- Calm
- Trustworthy
- Efficient
- Accessible
- Refined
- Purposeful

It should not feel:

- Generic
- Artificially futuristic
- Overdesigned
- Sterile
- Childish
- Decorative
- Visually noisy
- Like a copied shadcn demo
- Like an AI-generated landing page
- Like a generic startup dashboard

### Specific design rules

- No excessive gradients.
- No arbitrary bento grids.
- No unnecessary eyebrow labels.
- No meaningless icon decorations.
- No excessive card-in-card layouts.
- No random badges.
- No oversized empty dashboards.
- No repetitive section structures.
- No heavy default shadows.
- No unnecessary bright accent colors.
- No gradients as a substitute for hierarchy.
- No purely decorative charts.
- No unrelated icon styles.

Create hierarchy using:

- Typography
- Contrast
- Whitespace
- Grouping
- Alignment
- Surface treatment
- Scale
- Content priority
- Intentional composition

---

# PART V — FRONTEND ARCHITECTURE

## 15. Architecture Principles

The redesign should be built around shared design infrastructure, not page-by-page duplication.

Separate:

1. Design tokens
2. Low-level primitives
3. Composed shared components
4. Layout systems
5. Workflow-specific components
6. Route pages
7. Presentation hooks and view models
8. Existing business logic and APIs

Use the existing repository structure wherever practical.

Do not perform a large-scale directory reorganization unless justified.

## 16. Recommended Component Architecture

The following is a conceptual target, not an instruction to replace existing paths blindly.

    apps/web/
      app/
        globals.css
        ...existing routes

      components/
        ui/
          ...existing shadcn primitives

        layout/
          AppShell
          AppSidebar
          AppHeader
          MobileNavigation
          PageHeader
          SectionHeader
          ContentContainer
          ActionToolbar

        navigation/
          ClinicSwitcher
          UserMenu
          NavigationSection
          NavigationItem
          Breadcrumbs
          CommandSearch

        feedback/
          AppState
          EmptyState
          ErrorState
          LoadingState
          OfflineState
          SyncIndicator
          ConfirmationDialog

        data-display/
          Metric
          MetricGroup
          DataTable
          TableToolbar
          FilterBar
          StatusBadge
          Timeline
          DetailPanel

        forms/
          FormSection
          FormField
          FormActions
          ValidationSummary
          ClinicalValueInput

        charts/
          ChartContainer
          ChartLegend
          ChartEmptyState
          AccessibleChartTable

        clinical/
          PatientSummary
          PatientHeader
          ScreeningSection
          StationWorkspace
          ReviewQueue
          EncounterWorkspace
          ClinicalNotePanel

        marketing/
          MarketingHeader
          Hero
          ProductShowcase
          EditorialSection
          FeatureStory
          Testimonial
          MarketingFooter

        portal/
          PortalShell
          PortalNavigation
          PatientActionCard
          AppointmentSummary

The agent must inventory existing equivalents before introducing new files.

Reuse and extend existing components whenever possible.

Avoid parallel implementations of the same primitive.

## 17. Semantic Design Tokens

Continue using the existing CSS variable and Tailwind approach.

Establish or refine documented tokens for:

### Surfaces

- Canvas
- Primary surface
- Secondary surface
- Elevated surface
- Sidebar surface
- Inset surface
- Hover surface

### Text

- Primary
- Secondary
- Tertiary
- Muted
- Inverted
- Interactive

### Actions

- Primary
- Secondary
- Ghost
- Destructive
- Disabled

### Clinical states

- Draft
- Awaiting review
- Finalized
- Pending
- Complete
- Failed
- Unsynced
- Offline
- Warning
- Critical

### Structural tokens

- Border
- Input border
- Focus ring
- Radius
- Spacing
- Shadows
- Typography
- Chart series

Preserve the existing distinction between decorative borders and accessible input boundaries.

All status colors must retain readable labels or icons.

## 18. Component Library Strategy

The primary foundation remains:

**shadcn/ui + Radix UI + Tailwind CSS**

Use existing dependencies wherever possible.

Explore:

- shadcn Sidebar
- shadcn Chart
- Breadcrumb
- Command
- Navigation Menu
- Skeleton
- Popover
- Dialog
- Sheet
- Calendar
- Toggle Group

Evaluate React Bits, Kokonut UI, and Bklit UI only for specific documented use cases.

A library component may be adopted only if:

1. It solves a real design or workflow problem.
2. It works with the installed stack.
3. It does not duplicate existing functionality unnecessarily.
4. It meets accessibility requirements.
5. It works in light and dark mode.
6. It works responsively.
7. It has acceptable bundle impact.
8. It does not introduce a conflicting visual language.

Do not add dependencies purely for visual novelty.

---

# PART VI — APPLICATION SHELL & NAVIGATION

## 19. Redesign the Staff Workspace

The current sidebar is wide and visually dominant.

Explore an adaptive workspace architecture.

### Preferred exploration

Provide at least two viable concepts:

**Option A — Collapsible Sidebar**

- Expanded navigation with labels
- Compact icon mode
- Clear active states
- Persistent clinic context
- Accessible keyboard navigation
- Mobile navigation sheet

**Option B — Compact Rail + Contextual Navigation**

- Narrow primary rail
- Contextual secondary sidebar
- More space for clinical work
- Secondary navigation visible only when appropriate
- Clear labeling and discoverability

Evaluate both before selecting a direction.

Do not force icon-only navigation on users who depend on clear labels.

### Header

The header should support:

- Active clinic
- Clinic switching
- User account
- Role context
- Synchronization state
- Relevant operational utilities
- Theme control
- Navigation affordances

Do not overload it.

### Navigation policy

Preserve the existing permission-driven navigation architecture.

Study:

`apps/web/lib/app-nav.ts`

Preserve:

- Role permissions
- Clinic scoping
- Feature flags
- Route guards
- Active-route behavior
- Direct URL access
- Mobile navigation

### Important existing semantics

The current Notifications area is an outbound message delivery ledger.

It is not a personal notification inbox.

Do not invent unread counts.

Clinic settings are organizational configuration controls, not general personal preferences.

Place these controls appropriately and label them accurately.

### Responsive behavior

Desktop:

- Efficient workspace use.
- Collapsible navigation.
- Clear contextual controls.

Tablet:

- Comfortable touch interactions.
- Reduced navigation footprint.
- No horizontal overflow.

Mobile:

- Accessible navigation drawer or equivalent.
- High-priority actions available.
- No hidden critical status indicators.

---

# PART VII — ROLE-SPECIFIC DASHBOARDS

## 20. Dashboard Philosophy

The existing dashboards are too dependent on metric grids and charts.

The redesigned dashboards must answer:

1. What needs my attention?
2. What am I responsible for?
3. What is happening right now?
4. What is waiting for review?
5. What should I do next?

Do not simply rearrange the current KPI cards.

Create meaningful role-specific page hierarchies.

Use existing authorized data only.

If required information is unavailable through existing contracts, do not invent data. Document the limitation.

## 21. Volunteer Dashboard

Prioritize:

- Assigned station
- Next patient
- Pending screenings
- Incomplete work
- Today's completed work
- Operational guidance

Minimize irrelevant analytics.

## 22. Doctor Dashboard

Prioritize:

- Awaiting review
- Notes needing sign-off
- Pending clinical decisions
- Patients requiring follow-up
- Current encounter context
- Quick access to relevant workflows

Do not introduce autonomous clinical recommendations.

## 23. Manager Dashboard

Prioritize:

- Today's clinic activity
- Station throughput
- Pending handoffs
- Staffing and assignments
- Review queues
- Incomplete workflows
- Operational blockers

## 24. Director Dashboard

Prioritize:

- Clinic performance
- Screening activity
- Follow-up completion
- Clinical documentation quality
- Staff activity
- Relevant oversight and governance

## 25. System Administrator Dashboard

Prioritize:

- Cross-clinic operational overview
- Clinic administration
- User and role management
- Data quality
- Organization-level reporting
- Authorized administrative actions

## 26. Dashboard Acceptance Criteria

Every role dashboard must:

- Present meaningful actions before secondary analytics.
- Preserve existing access rules.
- Avoid misleading or fabricated metrics.
- Clearly distinguish empty data from loading or failure.
- Work in both themes.
- Work at all target viewport sizes.
- Keep primary tasks readily accessible.
- Preserve the existing API contracts.

---

# PART VIII — CLINICAL WORKSPACE REDESIGN

## 27. Patient Registry

Redesign the patient registry as a highly usable, efficient data workspace.

Explore:

- Prominent patient search
- Contextual filters
- Better table density
- Clear patient identity information
- Sticky headers where useful
- Accessible sorting
- Pagination
- Bulk operations only if already supported
- Contextual actions
- Patient-preview panels where justified
- Improved responsive layouts

Do not expose additional protected patient information.

Do not introduce new API contracts without separate approval.

Preserve the existing patient ID system.

### Important

Use safe test data in screenshots and design artifacts.

Do not publish real patient information to PRs, screenshots, external design tools, or logs.

## 28. Patient Records

Improve:

- Patient summary hierarchy
- Demographic readability
- Medical history organization
- Clinical measurements
- Encounter history
- Consent information
- Follow-up visibility
- Status labels
- Contextual actions

Clinical values must always remain clear and correctly labeled.

## 29. Stations and Screenings

The station workflow is a critical operational surface.

Design it for high-throughput clinical environments.

Prioritize:

- Next patient identification
- Clear workflow progress
- Fast data entry
- Readable measurements
- Strong input labeling
- Appropriate touch targets
- Error recovery
- Unsaved changes visibility
- Offline awareness
- Minimal unnecessary navigation

Preserve all existing:

- Fields
- Units
- Validation
- Defaults
- Save semantics
- Assignment logic
- Clinical state transitions

## 30. Queues and Clinical Encounters

Create clear visual distinctions between:

- Draft
- Pending review
- Awaiting sign-off
- Finalized
- Incomplete
- Failed

Improve:

- Queue grouping
- Status visibility
- Relevant action placement
- Encounter summaries
- Review layouts
- Note organization
- Handoffs
- Confirmation flows

Avoid changing the underlying clinical workflow.

## 31. Appointments and Follow-Up

Improve:

- Date navigation
- Appointment lists
- Calendar interaction
- Scheduling form layout
- Status presentation
- Patient context
- Follow-up actions

Preserve time zones, appointment rules, and state transitions.

Do not introduce unsupported scheduling behavior.

---

# PART IX — TABLES, FORMS & DATA PRESENTATION

## 32. Tables

Create a consistent table design across:

- Patients
- Appointments
- Staff
- Clinics
- Audits
- Duplicates
- Notifications ledger
- Research exports
- Administrative records

Each table should have:

- Clear column hierarchy
- Accessible sorting
- Appropriate density
- Consistent filtering
- Useful empty states
- Correct responsive behavior
- Clear row actions
- Keyboard support
- Visible focus
- Safe pagination

Reuse the existing TanStack-based DataTable where possible.

## 33. Forms

Clinical forms require exceptional reliability.

Standardize:

- Labels
- Field groups
- Required indicators
- Help text
- Validation errors
- Error summaries
- Save and cancel actions
- Disabled states
- Loading states
- Confirmation states
- Unsaved changes feedback

Never use placeholder text as the only label.

Use accessible relationships such as:

- `aria-invalid`
- `aria-describedby`
- Appropriate field grouping
- Visible validation messages

Do not change clinical validation behavior.

## 34. Charts and Analytics

Charts must communicate real information.

Do not create visually impressive but redundant charts.

Use the existing Recharts infrastructure and approved chart tokens.

Prefer meaningful analytical groupings.

Every chart must include:

- A clear title
- Understandable labels
- Accessible tooltip behavior
- Appropriate units
- Empty/loading/error states
- A text or tabular alternative where required
- Color-blind-aware presentation

Avoid repeated giant empty chart containers.

---

# PART X — PATIENT PORTAL & AUTHENTICATION

## 35. Patient Portal

The patient-facing portal must be mobile-first.

It should feel simpler and more approachable than the staff application.

Prioritize:

- Appointments
- Health information
- Self-reports
- Follow-up actions
- Clear status messages
- Accessible forms
- Low-bandwidth behavior
- Plain-language descriptions

Explore a distinct mobile navigation approach while retaining brand consistency.

Do not expose clinical administration concepts to patients.

Preserve the existing patient authorization boundaries.

## 36. Authentication and Onboarding

The existing application uses Keycloak-based authentication.

Audit and refine the visual presentation of:

- Login
- Invitation acceptance
- Record claiming
- Existing onboarding flows
- Error states
- Expired or invalid links

Preserve all authentication and security behavior.

The existing Keycloak theme self-hosts IBM Plex Sans and Source Serif 4.

Do not introduce remote font dependencies or weaken authentication protections.

---

# PART XI — PUBLIC WEBSITE REDESIGN

## 37. Redesign the Landing Page

The public Nkwapa website must receive its own comprehensive redesign.

Reference:

https://nkwapa.app

The current public website already has useful content and real-world healthcare context.

Preserve that substance while improving its visual presentation.

### Target experience

Create a modern editorial healthcare product website.

It should feel comparable in quality and thoughtfulness to Heidi Health without reproducing Heidi's brand.

### Hero section

Explore a stronger opening composition using:

- Powerful headline typography
- Clear product positioning
- Concise supporting copy
- Product visuals
- Real clinical context
- Strong CTA hierarchy
- Intentional whitespace

Avoid generic hero treatments.

### Product storytelling

Explain how Nkwapa supports:

1. Patient registration
2. Clinical screening
3. Vital signs capture
4. Clinical encounters
5. Doctor review
6. Follow-up
7. Offline/low-connectivity work

Use accurate existing capabilities.

### Content composition

Prefer:

- Editorial sections
- Split compositions
- Product walkthroughs
- Real photography
- Contextual screenshots
- Carefully designed comparisons
- Meaningful quotes or testimonials only when verified

Avoid mechanically repeating card grids.

### Product demonstrations

Create compelling, responsive demonstrations of the actual product where appropriate.

Use accurate screenshots or carefully constructed interface illustrations.

Do not fabricate functionality or clinical impact.

### Motion

Use subtle, performant transitions and interaction feedback.

Do not rely on heavy animation libraries unless justified.

### Supporting pages

Bring the following into the same visual system:

- Privacy
- Terms
- Public navigation
- Footer
- Contact interactions
- Cookie controls
- Announcement surfaces

Preserve legal content and consent functionality.

---

# PART XII — DESIGN QUALITY REQUIREMENTS

## 38. Light and Dark Mode

Both modes must be designed intentionally.

Do not simply invert colors.

### Light mode

- Warm neutral canvas
- Strong readable ink
- Refined teal accents
- Restrained gold accents
- Subtle borders
- Well-balanced surfaces

### Dark mode

- Deliberate near-black surface hierarchy
- Appropriate text contrast
- Controlled cyan/teal accents
- Clear elevation levels
- Accessible input boundaries
- Distinct semantic statuses

Avoid excessive visual heaviness.

Every shared component must be evaluated in both modes where supported.

## 39. Responsive Design

At minimum, test:

- 1440px desktop
- 768px tablet
- 390px mobile

Also evaluate content at intermediate widths.

The interface should adapt structurally rather than merely shrink.

Test:

- Navigation
- Tables
- Forms
- Dialogs
- Drawers
- Toolbars
- Patient details
- Clinical workspaces
- Charts
- Product demonstrations

No essential action should become inaccessible on mobile.

## 40. Accessibility

Target WCAG 2.2 AA.

Requirements include:

- Accessible contrast
- Visible keyboard focus
- Semantic structure
- Proper landmarks
- Accessible form labels
- Keyboard navigation
- Screen-reader labels
- Dialog focus management
- Appropriate touch targets
- Reduced-motion support
- No information conveyed by color alone
- Accessible errors and feedback

Test both normal and error states.

Clinical warnings must remain unmistakable.

## 41. Loading, Empty, Offline, and Error States

These must be designed as first-class experiences.

### Empty

Explain why content is absent and provide a next action where appropriate.

### Loading

Use meaningful skeletons without unnecessary layout shifts.

### Error

Explain the problem clearly and support safe recovery.

### Offline

Preserve and communicate offline functionality correctly.

### Syncing

Make synchronization status understandable without becoming distracting.

Never discard or conceal unsynced work.

Never show an empty-data state when the actual problem is a network failure.

---

# PART XIII — IMPLEMENTATION ORDER

## 42. Mandatory Phase Sequence

Follow this order unless a documented dependency requires adjustment.

### PHASE 00 — Research and Baseline

Tasks:

- Read repository guidance and epic #229.
- Audit actual routes.
- Inventory components.
- Analyze existing screenshots.
- Capture representative baseline screenshots.
- Run accessibility baseline.
- Inspect design dependencies.
- Study Heidi.
- Use Impeccable and Taste for critique.
- Identify usability and design issues.
- Create three design directions.
- Compare directions.
- Select the best supported direction.

Deliverables:

- Design audit
- Screenshot inventory
- Accessibility baseline
- Route inventory
- Role/task matrix
- Three visual concepts
- Selected direction and rationale
- Technical compatibility findings

Do not change production UI before completing this phase.

### PHASE 01 — Design Foundations

Tasks:

- Refine typography system.
- Refine semantic colors.
- Establish spacing and layout rules.
- Refine radii and elevation.
- Standardize component variants.
- Create or improve shared primitives.
- Build representative component states.
- Verify dark mode.
- Run design review.

Deliverables:

- Updated design documentation
- Tokens
- Component contracts
- Visual examples
- Accessible foundation

### PHASE 02 — Staff App Shell

Tasks:

- Redesign sidebar.
- Redesign header.
- Improve clinic switcher.
- Refine account menu.
- Reorganize navigation placements.
- Improve mobile navigation.
- Verify role permissions.
- Verify feature flags.
- Validate all navigation states.

Deliverables:

- New responsive shell
- Navigation component contracts
- Role-based navigation tests
- Screenshots

### PHASE 03 — Role Dashboards

Tasks:

- Volunteer dashboard
- Doctor dashboard
- Manager dashboard
- Director dashboard
- System Admin dashboard

Deliverables:

- Role-specific page hierarchies
- Work-first dashboards
- Reusable KPI structures
- Accessible states
- Role-specific screenshots and tests

### PHASE 04 — Clinical Workflows

Tasks:

- Patient registry
- Patient records
- Patient registration
- Consent screens
- Stations
- Check-in
- Screening forms
- Queues
- Encounters
- Clinical notes
- Doctor review
- Appointment workflows

Deliverables:

- Redesigned clinical pages
- Preserved validation
- Accessible forms
- Regression tests
- Workflow evidence

### PHASE 05 — Administration & Analytics

Tasks:

- Staff administration
- Clinic administration
- Audit
- Metrics
- Staff activity
- Organization reporting
- Duplicate review
- Notifications delivery ledger
- Research exports
- Data requests
- Any additional in-scope routes discovered during audit

Deliverables:

- Standardized administrative interface
- Consistent tables
- Improved analytics
- Accessible charts
- Permission regression tests

### PHASE 06 — Patient Portal & Authentication

Tasks:

- Portal layout
- Patient dashboard
- Health information
- Appointments
- Self-reporting
- Invitation screens
- Login visual system
- Record claiming

Deliverables:

- Mobile-first portal
- Updated authentication presentation
- Consistent responsive behavior
- Accessibility validation

### PHASE 07 — Marketing Website

Tasks:

- Homepage design
- Editorial hero
- Product showcases
- Feature storytelling
- Photography and imagery
- Responsive sections
- Navigation
- Footer
- Supporting public pages
- Cookie controls
- Marketing interactions

Deliverables:

- Redesigned public site
- Responsive screenshots
- Performance review
- Accessibility testing
- SEO and functionality verification

### PHASE 08 — Motion & Interaction Polish

Tasks:

- Review all transitions.
- Standardize feedback.
- Evaluate Sileo against Sonner.
- Improve empty states.
- Refine hover and focus behavior.
- Improve mobile overlays.
- Remove distracting animations.
- Apply Impeccable.
- Apply Taste.
- Validate reduced motion.

Deliverables:

- Coherent interaction language
- Feedback system
- Motion guidelines
- Polished page states

### PHASE 09 — Final QA & Release

Tasks:

- Full route audit.
- Visual regression.
- Role-based E2E testing.
- Accessibility checks.
- Performance checks.
- Responsive testing.
- Light/dark comparison.
- Offline validation.
- Clinical workflow regression.
- Final documentation.
- Release readiness report.

Deliverables:

- Completed QA matrix
- Before/after evidence
- Updated design system
- Regression report
- Release and rollback notes

---

# PART XIV — GITHUB ISSUE & PR MANAGEMENT

## 43. Epic Management

Use GitHub epic #229 as the parent issue.

Do not discard existing requirements.

Extend the epic to include the full product redesign.

Create a clear phase checklist and dependency map.

### Proposed child issues

Use these identifiers as planning references; actual GitHub issue numbers will be assigned by GitHub.

- UX-01: Route, role, component, and viewport audit
- UX-02: Design research and visual direction
- UX-03: Technical feasibility and architecture
- UX-04: Semantic tokens and typography
- UX-05: Shared component foundation
- UX-06: Staff application shell
- UX-07: Navigation and account utilities
- UX-08: Volunteer and Doctor dashboards
- UX-09: Manager, Director, and Admin dashboards
- UX-10: Patient registry and records
- UX-11: Stations and screenings
- UX-12: Queues and encounters
- UX-13: Appointments and follow-up
- UX-14: Administration and governance
- UX-15: Analytics and reporting
- UX-16: Patient portal
- UX-17: Authentication and onboarding
- UX-18: Public landing page
- UX-19: Public navigation and supporting pages
- UX-20: Motion and feedback
- UX-21: Responsive and offline refinements
- UX-22: Full regression and accessibility QA
- UX-23: Release readiness and documentation

Before creating issues, search GitHub for existing related work.

Do not duplicate active or completed issues.

Link existing issues wherever appropriate.

Coordinate with related issues such as #189, #224, #206, and #207 when relevant.

If you have authorized GitHub write access, create and organize the child issues and update the epic.

If access is unavailable, generate complete issue bodies ready for GitHub submission.

## 44. Branch Strategy

Every implementation PR should branch from:

`release/dev`

Use short-lived branches.

Suggested naming:

- `design/ux-01-audit`
- `design/ux-04-foundations`
- `feat/ux-06-app-shell`
- `feat/ux-08-role-dashboards`
- `feat/ux-10-patient-workspace`

Actual branch names should use the assigned GitHub issue numbers where practical.

Do not create a single enormous redesign branch.

Do not stack dependent PRs in a way that risks orphaned changes.

Complete, validate, and integrate foundations before building downstream components.

## 45. PR Contract

Every PR must include:

- Summary
- Linked issue
- Scope
- Screenshots
- Design changes
- Accessibility results
- Responsive testing
- Automated tests
- Risks
- Known limitations
- Documentation updates
- Rollback considerations

No PR is complete merely because its code has been committed.

---

# PART XV — TESTING & QUALITY CONTROL

## 46. Automated Testing

Use the repository's existing testing infrastructure.

At minimum:

- Lint
- Typecheck
- Relevant unit tests
- Production build
- Playwright E2E
- Accessibility checks
- Visual regression where available

Inspect CI configuration before deciding which commands and environment variables are required.

Do not claim tests passed unless executed.

If a test cannot run, document why.

## 47. Role-Based QA Matrix

Verify these account types:

- System Admin
- Director
- Manager
- Doctor
- Volunteer
- Patient

At minimum, test each relevant role at:

- Desktop
- Tablet
- Mobile
- Light mode
- Dark mode, where supported
- Keyboard-only
- Screen-reader flow
- Reduced motion
- Loading/error states

Test representative real workflows, not only whether pages render.

## 48. Clinical Safety Regression

Specifically verify:

- Patient creation
- Patient lookup
- Check-in
- Screening data entry
- Clinical measurements
- Encounter creation
- Review
- Sign-off
- Consent
- Appointment actions
- Sync behavior
- Permission enforcement

No redesign may silently change a clinical default, validation rule, measurement unit, consent control, or finalization action.

## 49. Performance

Establish a baseline before implementation.

Watch for:

- Larger JS bundles
- Excessive client components
- Large image payloads
- Font loading delays
- Heavy motion
- Unnecessary rerenders
- Poor table performance
- Layout shifts
- Slow navigation
- Low-end mobile performance

Use optimized local assets and existing framework capabilities.

Do not introduce additional network dependencies in critical clinical workflows without justification.

---

# PART XVI — DOCUMENTATION DELIVERABLES

## 50. Required Documentation

Use or extend the existing documentation structure.

Suggested documents:

    docs/design-system/
      MASTER.md
      DESIGN-DIRECTION.md
      REFERENCE-AUDIT.md
      ROUTE-INVENTORY.md
      COMPONENT-INVENTORY.md
      TYPOGRAPHY.md
      INTERACTION-GUIDELINES.md
      RESPONSIVE-GUIDELINES.md
      ACCESSIBILITY.md
      REDESIGN-ROADMAP.md
      QA-MATRIX.md

Avoid creating duplicate documents when suitable existing files already exist.

Documentation must remain accurate to the implemented code.

Clearly distinguish proposed changes from completed changes.

## 51. Visual Evidence

For significant pages, capture:

- Before desktop
- After desktop
- Before mobile
- After mobile
- Light mode
- Dark mode
- Key interactive states

Use redacted or synthetic patient information.

Do not commit sensitive production data.

---

# PART XVII — OPERATING INSTRUCTIONS FOR CODEX

## 52. How You Should Work

This is a substantial project.

Do not attempt to implement every phase in one unreviewable change.

Operate in small, independently testable units.

Follow the implementation order and dependency map.

For each task:

1. Inspect the existing code.
2. Read the relevant documentation.
3. Understand the user workflow.
4. Identify existing reusable primitives.
5. Identify constraints.
6. Produce a concrete implementation plan.
7. Make focused changes.
8. Run tests.
9. Review screenshots.
10. Apply Impeccable and Taste.
11. Correct visual and functional issues.
12. Update documentation.
13. Prepare a focused PR.
14. Record progress in the parent epic.

Do not repeatedly ask for clarification on routine decisions.

Use your engineering and product judgment.

However, flag decisions that fundamentally change:

- Clinical behavior
- Authorization
- Security
- Data models
- Offline semantics
- Public branding
- Significant architecture

Such changes require separate explicit approval.

## 53. Avoid Premature Abstraction

Do not create a large component library before understanding the actual workflow needs.

Build a small coherent foundation and extend it as real use cases emerge.

Avoid overengineering.

Avoid excessive configuration.

Prefer simple, maintainable implementations.

## 54. Do Not Stop at Basic Visual Changes

A task is not finished because:

- The page looks different.
- The CSS was updated.
- Components were replaced.
- New animations were added.
- A screenshot looks attractive.

A task is finished when:

- The hierarchy is substantially improved.
- The workflow remains efficient.
- The implementation is accessible.
- The layout is responsive.
- The design is consistent.
- Functional behavior is preserved.
- Tests pass.
- Visual QA is complete.
- Documentation is accurate.

## 55. Agent Collaboration

If multiple agents are available, use parallel work only where changes do not conflict.

Suitable parallel work:

- Design research
- Component inventory
- Accessibility audit
- Route inventory
- Reference analysis
- Independent UX critiques

Do not assign multiple agents to change shared tokens, navigation contracts, or the same components simultaneously.

Design foundations and shared architecture must have clear ownership.

Integrate changes only after validating them against the approved design system.

## 56. Progress Reporting

Maintain a concise progress report after each implementation unit.

Include:

- Phase
- Issue
- Completed changes
- Files modified
- Tests executed
- Results
- Screenshots
- Remaining risks
- Next dependency

Use evidence rather than vague completion claims.

---

# PART XVIII — NON-NEGOTIABLE GUARDRAILS

The following rules override aesthetic preferences.

1. Do not modify clinical business logic as part of the redesign.
2. Do not change role permissions.
3. Do not change API contracts.
4. Do not modify RLS policies.
5. Do not alter medical measurement units.
6. Do not change clinical validation or defaults.
7. Do not remove offline functionality.
8. Do not weaken consent or authentication behavior.
9. Do not expose unauthorized patient data.
10. Do not use actual patient information in design artifacts.
11. Do not replace established infrastructure without justification.
12. Do not remove important accessibility behavior.
13. Do not weaken automated tests.
14. Do not introduce proprietary third-party assets without proper rights.
15. Do not use excessive animation.
16. Do not create duplicate component systems.
17. Do not add dependencies without compatibility evaluation.
18. Do not change brand colors arbitrarily.
19. Do not merge unrelated redesign work.
20. Do not claim functionality or testing that has not been verified.
21. Do not publish or merge directly to production.
22. Do not treat visually attractive design as more important than clinical reliability.

This project serves real healthcare users.

Usability, privacy, accessibility, and correctness are essential.

---

# PART XIX — DEFINITION OF SUCCESS

The redesign should deliver:

### Visual quality

A distinct, cohesive Nkwapa identity comparable in craftsmanship to excellent modern healthcare products.

### User experience

A calmer, clearer application where each role understands what needs attention and how to complete their work.

### Consistency

Shared components, typography, spacing, states, and interactions across the entire product.

### Performance

Responsive interfaces that remain practical on lower-end devices and unreliable connections.

### Accessibility

Usable workflows across keyboard, screen-reader, touch, and different viewport sizes.

### Engineering quality

Maintainable components, clear contracts, clean documentation, and reliable tests.

### Clinical reliability

Zero unintended changes to clinical logic, permissions, security, patient data, or offline behavior.

### Product transformation

The public website, staff workspace, patient portal, and authentication experience should look and feel like parts of one thoughtfully designed product.

---

# PART XX — INITIAL EXECUTION DIRECTIVE

Begin by examining the repository and epic #229.

Do not immediately redesign a page.

Your first actions must be:

1. Confirm the active branch and repository status.
2. Read the relevant repository instructions.
3. Fetch and review epic #229.
4. Read the current design-system master document.
5. Inspect application architecture and dependencies.
6. Generate an accurate route and account-type inventory.
7. Locate the installed Impeccable and Taste skills.
8. Study the supplied Heidi and Nkwapa screenshots.
9. Identify existing design inconsistencies and workflow problems.
10. Prepare the Phase 00 audit and design exploration deliverables.
11. Create or reconcile the proposed child issues with existing GitHub issues.
12. Establish the implementation dependencies.
13. Produce three concrete visual directions with representative prototypes.
14. Select a recommended direction using evidence and usability criteria.
15. Record the approved implementation plan.

Only then proceed to the design foundation and production implementation phases.

Continue executing approved, independently scoped work in the documented order as the environment and review workflow permit.

Do not skip baseline capture, accessibility verification, visual review, or testing merely to move faster.

Use Impeccable and Taste throughout the project, particularly during visual concept development, component construction, and final refinements.

## Final instruction

Treat this as a real product transformation for a healthcare organization—not a portfolio redesign exercise.

Make Nkwapa feel sophisticated, modern, welcoming, incredibly usable, and professionally engineered.

Preserve the product's purpose and identity.

Every visual element should earn its place.

Every workflow should feel intentional.

Every component should belong to the same design system.

Every change should be testable.

And every implementation phase should leave the product in a reliable, shippable state.

Mandatory checkpoint: Complete the GitHub issue breakdown, research, and three visual design concepts first. Present the concepts with screenshots, comparisons, and your recommended direction. Do not begin production UI implementation until I approve a concept.
