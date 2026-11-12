# Phase W: Role workspaces (pilot layout parity)

Inserted 2026-11-11 by the owner, **after R7 and before R8**. R8.1 (`HANDOFF-R8.1.md`) does not
start until W1 to W4 are committed. Same branch (`ui-refresh/r1-1-tokens`), same rules: direct
mode (no learning guardrails, no teach-back), frontend only, local commits, never push.

## Why this phase exists

The R1 to R7 units restyled every screen (tokens, type, rules, controls, states) but mostly kept
each screen's **composition**. The approved R0 pilot (`r0-pilot/index.html`, evidence in
`evidence/r0/*-1440-light.png` and `*-390-light.png`) changed composition. A side-by-side survey
on 2026-11-11 found:

- **Dashboard is one stacked page for every role.** `app/(workspace)/dashboard/page.tsx` renders a
  generic `AppPageHeader` (clinic name), "Needs you now", the same five-KPI "Today at a glance" grid,
  then role sections stacked by permission. Only a volunteer-only user gets `VolunteerWelcome`. The
  pilot drew a home per role (`#s-dash-doctor`, `#s-dash-manager`, `#s-dash-director`,
  `#s-dash-admin`): greeting band, the role's main action, a four-figure strip that matters to that
  role, then its own work. No R-unit owned the role dashboards (R4.1 = notes/cosign, R4.2 = review
  and Today Board, R4.3 = governance screens), and the screen matrix in `PROGRESS.md` was never
  filled, so the gap went unseen.
- **Stations kept every legacy block.** R3.2 adopted the ticket, Sheet picker and line, but the page
  still stacks page header + Refresh, "On Duty", "My station", ticket, verbose queue, "Who is
  working on this account?", whole line. On a 390 phone the next patient is **below the first
  screen**; in the pilot it is the first thing under the duty strip.
- The data the pilot shows exists (queue `dob`, handoff, waits; director follow-up rate; station
  flow). "Do not invent data" was not the blocker; keep honouring it.

## Owner decisions

- Start with W1 Stations.
- **W2: one home for the person's main role** in the active clinic, not a stack and not a role
  switcher. Precedence by responsibility: `SYSTEM_ADMIN` > `DIRECTOR` > `MANAGER` > `DOCTOR` >
  `VOLUNTEER`. The other roles they hold appear as a short "Also on your plate" list of links /
  counts (e.g. "3 visits waiting for your sign-off · Open queues"), never as their full sections.

## Units

Each unit: inspect pilot screen + current code, rebuild the composition, keep every action,
permission gate, offline/pending overlay, refusal and truthful state, check 1440 / 1024 / 744 /
390 / 320 in both themes, 200% text, keyboard. Validation as in `HANDOFF-R8.1.md` ("Validation")
plus synthetic product screenshots where the landing uses that screen.

| Unit | Screen                                          | Pilot                                    | Target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| W1   | `/stations` (volunteer; manager/staff share it) | `#s-station`, `evidence/r0/station-*`    | One **duty strip** (state dot, "since", station picker trigger, End shift; off duty: role + Start shift in the same strip). No page title block on duty (keep one `h1`: "Next at <station>" as in the pilot, visually an eyebrow). **Ticket first**: gold queue number, name, code · sex · age, wait with a meter (20 min = amber, same rule as station line), one Take patient + Open chart. "Also waiting here": compact rows (position, name, code, minutes), no per-row primary button; per-row take stays reachable as a quiet action. Hand-off note shown only when there is one. Line: count above a filled (busy) or hollow (empty) stop, yours gold. Screener ("Who is working") folds into the strip/ticket. Phone: strip, ticket, list; sticky "Take <name>". |
| W2   | `/dashboard` per main role                      | `#s-dash-*`, `evidence/r0/*-dashboard-*` | `RoleHome` per main role: greeting band (reuse `VolunteerWelcome` frame), role primary/secondary actions, a 4-figure strip, then the role's own work (doctor: sign-off and cosign lists, BP levels; manager: wait/service per station, needs attention; director: trends and coverage; admin: network). Remove the shared "Today at a glance" grid as the lead. "Also on your plate" for other roles. Keep `DASHBOARD.READ`, refresh, error/empty states.                                                                                                                                                                                                                                                                                                                |
| W3   | `/patients`, `/queues`                          | `#s-patients`, `#s-queues`               | Pilot table density: count beside title, search with `/` hint, filter chips, phone / last visit / location columns, one quiet "View" + outline "Check in" per row; phone cards. Queues to the pilot list.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| W4   | Volunteer home                                  | `#s-dashboard`                           | Greeting band then the line and "Your clinic day" checklist; clinic-wide charts move below or off the volunteer's home.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

After W4: update `PROGRESS.md` screen matrix rows for every screen W touched, then hand to R8.1.

## Progress

- W1: complete (2026-11-11), `W1-REVIEW.md`. Next: `HANDOFF-W2.md`
- W2: complete (2026-11-12), `W2-REVIEW.md`. Landing manager shot re-capture pending (daytime). Next: `HANDOFF-W3.md`
- W3: not started
- W4: not started
