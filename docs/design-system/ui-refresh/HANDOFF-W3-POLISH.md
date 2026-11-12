# Handoff: W3 polish pass (every role, every tab) before W4

Paste this whole file to the agent. It is self-contained.

## Your job

Nkwapa is a clinic EMR (Next 16.3 canary, React 18.3, Tailwind 3.4, shadcn/Radix, TanStack Table
v9, framer-motion; NestJS + Prisma API). The UI refresh has standardised every list tab (W3,
commit `e453a18b`), but the owner's verdict on the screenshots is blunt: **every page except the
dashboard looks like the first version.** The dashboard (`components/dashboard/RoleHome.tsx`,
`VolunteerWelcome.tsx`, `hello-rest.ts`, `NeedsYouNow.tsx`) is the bar: a warm, personal greeting,
clear "what needs you now", breathing room. Bring every other workspace page up to that bar, for
every role (volunteer, doctor, HAP, manager, director, system admin, patient portal where the shell
is shared). This is a design pass, not a feature pass: no behaviour, permission or data changes.

Work in small units, one area at a time, validating each before the next. Commit locally after
each unit. **Never push.**

## Read first

1. `docs/design-system/MASTER.md`, especially §4 (type, dark), §5.4 (form dialogs), §8.1 (states),
   §9.1 (motion), §10.1 (focus), §11.1 (perf: never import the `@nkwapa/db` root in web), and
   "Lists (W3)". Where this brief conflicts with MASTER, this brief wins; update MASTER to match.
2. `docs/design-system/ui-refresh/W3-REVIEW.md`, `HANDOFF-W4.md`, `PHASE-W.md`, `PROGRESS.md`.
3. `apps/web/AGENTS.md`: this Next version has breaking changes; read
   `node_modules/next/dist/docs/` before using any Next API you are unsure of.
4. Shared pieces you will touch: `components/app-shell/` (`BottomNav`, `AppNavList`,
   `AppPageHeader`, `AppMetricCard`, `ListToolbar`, `SegmentedControl`), `components/Sidebar.tsx`,
   `components/AppLayout.tsx`, `components/Header.tsx`, `components/sync/SyncStatusBar.tsx`,
   `lib/app-nav.ts`, `components/ui/data-table.tsx`, `app/globals.css`, `tailwind.config.*`
   (breakpoints: `compact` 600px, `tablet` 840px, `desktop` 1200px).

## Hard rules

- Brand: palette only from the logo's teal and gold. Plex Sans in the workspace, Source Serif page
  titles. Keep nav labels as they are **except** the phone bottom bar change in item 1. No count
  badges on nav items.
- Use the colour tokens that already exist but are barely used: `--mint`, `--mint-line`, `--deep`,
  `--gold-surface`, `--gold-ink`, `--brand`, `--selected`, `--surface-2`, and the status surfaces
  (`--info-*`, `--success-*`, `--warning-*`, `--severe-*`, `--destructive-*`). Every colour must
  hold in both themes (check `.dark` values) and pass WCAG AA for text.
- Never convey state by colour alone (WCAG 1.4.1). Where you remove a word, keep an icon shape and
  an accessible name (`aria-label`, `sr-only`, or a tooltip) that says it.
- Accessibility floor: 44px touch targets on coarse pointers (36/40px allowed on fine pointers,
  see MASTER pointer-aware controls), one `h1` per page, correct heading order, visible focus,
  `prefers-reduced-motion` respected, no horizontal page scroll from 320px to 1440px.
- Data: `references/01-current-ui` holds real patient data and is git-ignored. Never open-and-cite,
  crop, upload or commit it. Screenshots only from seeded or synthetic data.
- Never print env values or credentials. Never push. Commit messages end with your attribution line.
- Do not change API contracts, permissions, URL state, offline behaviour, or test ids. If you
  change a visible string, `grep -rn` it in `apps/web/e2e/` and update the specs in the same unit.
- Jest: always `--maxWorkers=2` (an uncapped run froze the machine).

## The changes

### 1. Phone bottom bar: short labels (320–599px only)

`components/app-shell/BottomNav.tsx` (labels come from `lib/app-nav.ts`). Below `compact` the
labels wrap ("Dashboar d", "Today Board" on two lines). Add a `shortLabel` to nav items and render
it only below 600px: Dashboard → **Home**, Today Board → **Today**, Stations, Queues, More stay.
Apply to every role's bar (check what each role's first four slots are and give each a one-word
short label). Keep the full label as the accessible name (`aria-label` or sr-only) so screen
readers and e2e `getByRole('link', { name: 'Dashboard' })` still match; grep e2e for each label.
Labels on one line, centred, 11–12px, no truncation at 320px. Sidebar, More sheet and the 600px+
bar keep the full labels.

### 2. Fewer words, same information, on every screen size

Audit every workspace page (list all routes from `lib/app-nav.ts` plus detail pages) and cut text
density without losing meaning:

- Page descriptions: one short line (under ~70 characters). Move explanations into the existing
  header help (`AppPageHeader helpTitle/helpText`) or a `ProgressiveHelp` placed **after** the
  content. Keep only text that changes what the person does next.
- Section descriptions that restate the heading: delete. Counts and "Showing x of y": one quiet
  line, never repeated in a tile and a description.
- Labels that repeat the column or chip they sit in ("Status: Active" under a Status column):
  remove.
- Inline paragraphs of policy or rules: a help button (ⓘ, `InfoHint`) next to the thing it
  explains.
- Use whitespace and grouping (proximity, common region) instead of rules and boxes to separate
  things. Prefer one strong rule per page over many.
- Record the before/after word count for each page's first screen at 390 and 1440 in the review
  doc; aim to cut roughly a third or more without dropping any fact.

### 3. Summary figures: no more stuck-together blocks

Today `AppMetricGroup` (panel and `variant="strip"`) draws figures as cells of one grid with shared
hairlines (Clinics, Duplicate review, Cross-clinic, Staff, Message delivery, My Assigned,
Appointments, Metrics, Organization report, Research). Redesign the summary as **separate,
breathing elements** that feel personal:

- Explore and pick one system, then apply it everywhere: e.g. a sentence-style summary on the
  page ("**47** pairs need review, **1** very likely"), or floating stat chips with soft tinted
  surfaces (`--mint`, `--gold-surface`, status surfaces by meaning), generous gaps, no shared
  borders, subtle depth (a soft shadow or a 1px inner highlight, not heavy rules).
- The figure that needs action gets the tint and leads (e.g. Failed messages, Needs attention,
  Very likely). Zero-value figures recede (muted) instead of shouting "0".
- On phones, a horizontal scroll-snap row or a two-line sentence, never a 2×N grid of boxes.
- Keep the "what does this count" text reachable (help icon or `title`), as now.
- Dashboards keep their richer panel only if the new system cannot express them; say which you
  chose and why in the review.

### 4. Duplicate review / Cross-clinic filters on small screens

`components/admin/duplicates/DuplicateFilterFields.tsx`. Below ~744px the three label + select
pairs wrap raggedly (Decision / Match strength / Why it matched). Replace on small screens with
the Patients pattern: search, then a dashed **Filter** chip opening a bottom Sheet (`ListFilters`
in `components/app-shell/ListToolbar.tsx`) holding the three selects, plus removable chips for
non-default values. Keep the inline selects at 744px+ only if they fit on one line; otherwise use
the chip pattern there too. Keep the select ids (`duplicate-status`, etc.) and label texts: e2e
uses `getByLabel('Decision')` and `getByLabel('Why it matched')`, so specs must open the sheet first
if the select moves into it (update `e2e/duplicate-review.spec.js`,
`e2e/cross-clinic-investigation.spec.js`).

### 5. Sidebar: icon-only when collapsed; tablet gets an overlay drawer

`components/Sidebar.tsx`, `AppNavList.tsx`, `AppLayout.tsx`.

- **Desktop (1200px+), collapsed:** icons only, no labels under them; each icon gets a 40–44px
  target with even vertical rhythm, a tooltip with the label on hover and keyboard focus (Radix
  Tooltip, ~300ms first delay, instant for neighbours), an `aria-label`, and a clear selected state
  (`--selected` pill, teal icon). Section groups separated by space, not text.
- **Tablet / iPad (600–1199px, both orientations):** the rail shows icons only, no labels. A menu
  button (top-left in the header, and/or the rail's top) opens a **separate overlay drawer** with
  the full labelled navigation, sliding in from the left over a dimming scrim (fade + translate,
  ~200–250ms ease-out, `--ease-drawer`; reduced motion: fade only). It closes on scrim tap,
  Escape, swipe left, and route change; focus is trapped while open and returns to the trigger.
  Use Radix Dialog / the existing `Sheet` (side left) or `vaul` if already installed; do not add a
  dependency for this alone. This drawer exists only at tablet sizes; phones keep the bottom bar +
  More; desktop keeps the docked sidebar.
- Keep `nkwapa.sidebar.collapsed` persistence and the `[` shortcut on desktop. Check
  `e2e/shell-navigation.spec.js`, `shell-responsive.spec.js`, `responsive-*.spec.js` for
  assertions about rail labels and update them.

### 6. Sync status without the word

`components/sync/SyncStatusBar.tsx` (used in `Header.tsx`). On all sizes, the synced state shows
only the green check icon in a compact pill or dot (no "Synced" / "All synced" text). Keep
`aria-label="All changes synced"` (or the current state's full text) and a tooltip. **Other states
keep a word** (Syncing, Offline, N waiting, Failed): those need attention and colour alone is not
enough. The control's width must not jump between states (reserve the icon slot; the word appears
beside it). Check `e2e/sync-recovery.spec.js` and the `SyncPill` component fixture for text
assertions.

### 7. Personal, friendly, deep: carry the dashboard's warmth to every page

The dashboard works because it talks to a person and leads with what needs them. Apply that to
every page and role:

- **Page headers:** a short human line instead of a manual ("12 messages went out today, none
  failed." rather than "Review every message the clinic has sent: reminders, ..."), computed from
  data already on the page. Fallback to a short static line while loading. No invented numbers.
- **Lead with the action:** each list page answers "what needs me?" first (failed messages,
  clinics needing attention, very likely duplicates, invites expiring), with a one-tap way to
  filter to it.
- **Depth:** a consistent elevation scale (surface, raised, overlay) using existing tokens and soft
  shadows; cards only where content is a unit you act on, not as wallpaper.
- **Colour with meaning:** teal for primary action and selection, gold for "your attention"
  highlights and welcome moments, mint for calm success, status surfaces for states. Reuse the
  dashboard illustration style (`DashboardIllustration`, Lottie empty states) for empty states on
  every list, with copy that says what will appear and when.
- **Empty and first-run states** per role: friendly, specific, one action.
- **Motion** (MASTER §9.1): press feedback on buttons (`scale(0.97)`), list rows and chips
  entering with a short stagger only on first load, sheet and drawer motion as above, no motion on
  keyboard-repeated actions.
- Apply UX laws explicitly and name them in the review: Hick (fewer visible choices, progressive
  disclosure), Fitts (big primary targets near the thumb on phones), Jakob (familiar patterns:
  Linear / Vercel / Stripe style lists), Miller and chunking (group fields), proximity and common
  region (space over borders), Tesler (system absorbs complexity: sensible defaults), Doherty
  (optimistic UI and skeletons under 400ms), aesthetic-usability, peak-end (a pleasant confirmation
  after key actions).

### 8. Staff & Access at 744px (and every toolbar at tablet width)

`app/(workspace)/admin/users/page.tsx` and `components/staff/StaffInvitesCard.tsx`. At 744px the
invitations tabs (All / Open / Expired / Accepted / Cancelled with counts) sit beside the search
box and collide. Redesign the invitations area: a compact header ("Invitations", primary "Invite a
colleague"), the status filter as a `SegmentedControl` or scrollable chip row on its own line, the
search full width below it (or behind a search icon button that expands), and the table bled like
the roster. Check every page's toolbar at 600, 744, 840 and 1024px for the same collision (Clinics,
Duplicates, Audit, Message delivery, Appointments, Volunteers, Queues, Today Board, Stations).

### 9. Find more (owner asked you to think beyond this list)

At minimum, investigate and fix what you find in:

- Header at 320–390px: clinic name truncation ("Nkwap…", "Director, …"); consider showing just
  the clinic switcher icon + initials, role in the switcher sheet.
- Patients search placeholder truncates at 320px ("…ID las"): shorter placeholder, full text in
  the label.
- Row actions: one primary per row max; secondary actions in a `…` menu (Radix DropdownMenu).
- Tables at tablet widths: hide low-value columns progressively instead of horizontal scroll;
  show them in the row's detail or the phone card.
- Dates: relative for recent ("2 h ago", full Accra time in `title`), absolute beyond a week.
- Long ids in tables: mono, truncated, copy button on hover.
- The floating chat button covers the last row and the pager's next arrow at 1024px and on
  phones: give pages enough bottom padding or move the launcher into the header on wide screens.
- My Assigned: "Shift Status", "On Duty", "Checked in as" casing and the shift card's density
  (`ShiftControlCard`, shared with the dashboard).
- Appointments, Data requests, Metrics, Staff activity, Research exports, Organization report,
  Account, Settings, the encounter and patient chart pages: apply items 2, 3 and 7.
- Dark mode: check every new tint and shadow; dark shadows need lighter edges, not darker blurs.

External references worth studying (patterns, not visual copies): Linear (list toolbars, filter
chips, density), Vercel dashboard (summary sentences, empty states), Stripe dashboard (tables,
relative dates, row menus), Apple HIG (iPadOS sidebar and overlay behaviour, SF-style tab bar
labels), Material 3 (navigation rail vs modal navigation drawer breakpoints), shadcn/ui blocks
(sidebar-07 collapsible icons, data-table toolbar), Radix primitives, Vaul (drawers), Sonner
(confirmations). Cite what you borrowed in the review.

## Validation (every unit)

From `apps/web` with the CI environment (feature flags and rate-limit/email vars from
`.github/workflows/ci.yml`, including `NEXT_PUBLIC_*`; Keycloak only redirects to
`localhost:3000`; a reseeded database can desync Keycloak subs, see the e2e notes in the repo):

1. `npx tsc --noEmit -p .`, `npx eslint <changed files>`, `npx prettier --check <changed files>`.
2. `npx jest --maxWorkers=2`.
3. Build: `NODE_OPTIONS=--max-old-space-size=3072 npm run build`. Rebuild the API too if you touch
   it (Playwright starts it from `dist`).
4. Focused Chromium e2e for every spec that touches what you changed, one worker:
   `npx playwright test <specs> --project=chromium --workers=1 --reporter=line`. Known failures
   that predate this work (do not chase, but do not hide): `patient-residential-location` line 36,
   `keyboard-focus` portal self-report at 390, `responsive-migration` /dashboard "Today at a
   glance", `staff-invite` profile test. Compare against `e453a18b` before calling any other
   failure pre-existing.
5. Six-role route audit:
   `WEB_DIR=$PWD EVIDENCE_DIR=<tmp> npx playwright test -c ../../docs/design-system/route-audit/route-audit.config.cjs --workers=1`.
   Target: 228 rows, 0 violations, 0 minor, 0 overflow, one `h1` everywhere (current baseline).
6. Screenshots of every changed page at 1440, 1024, 744, 390, 320 in light and dark, plus the
   tablet drawer open, from seeded data only. Look at them before declaring done.

## Deliverables

- Code, updated specs, and MASTER sections for: bottom bar short labels, sidebar rail and tablet
  drawer, sync indicator, the summary-figure system, page header voice, density rules.
- `docs/design-system/ui-refresh/W3-POLISH-REVIEW.md`: a Before | After | Why table per area,
  UX laws applied, references borrowed, word counts, open items.
- A `PROGRESS.md` entry with real validation numbers (never estimated), and `HANDOFF-W4.md`
  "Carried" items updated.
- Local commits per unit. Do not push.
