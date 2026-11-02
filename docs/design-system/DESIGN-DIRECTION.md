# Design direction: Nkwapa 2.0

For #262 (epic #229). **Status: A, Ruled Chart, approved by the owner 2026-11-01.** Its rules are in [MASTER.md section 12](MASTER.md#12-nkwapa-20-direction-ruled-chart).

Review page with working prototypes, light and dark: https://claude.ai/artifact/7u7Xs9fCDKp7yorDNFG7Pm (private). Source: [concepts/nkwapa-2-directions.src.html](concepts/nkwapa-2-directions.src.html) (images are injected at publish time, so open the artifact, not the file).

## Fixed for every direction

Teal and gold brand, `#00778A` action teal, Source Serif 4 plus IBM Plex Sans, the MASTER.md token values, nav labels and permission filtering, clinical fields and save behaviour, English only, laptops as the main station device. Each direction is drawn on the same three surfaces: a manager's Today workspace (1280 × 800), a volunteer at a station on a phone, offline (390 × 800), and the landing hero (1280 × 640).

## A. Ruled Chart (recommended)

Every screen reads like a well-kept observation chart: ruled, time-ordered, numbers first. Chrome drops to hairlines.

- **Shell:** labelled 232px sidebar on the canvas colour, collapsing to 64px icons with tooltips. Header: clinic switcher with the active role as text, sync state, Message delivery icon, account. One refresh.
- **Signatures:** a "Needs you now" list of ruled action rows; the station line as lanes where bar length is minutes since `queuedAt` (warning colour plus a text label past 20 minutes, unstaffed lanes say so); corrected readings stay visible, struck through, with who and when; teal only on what can be pressed or is selected.
- **Charts:** straight segments between real readings, direct labels, table toggle.
- **Risk:** restraint can read as plain; needs an exact type and spacing pass.

## B. The Folder

The visit is the OPD folder a patient carries between tables. Each station stamps it (station, time, initials; dashed when pending, orange "Held" when saved offline).

- **Shell:** 76px labelled rail for five areas plus More, with a contextual panel inside Today, Patients and Queues.
- **Risk:** the metaphor strains on admin, audit and analytics; needs a new card family; density grows on busy days.

## C. Margin Review

A page of record with a working margin: two columns around a rail of station keys, decisions bracketed in a wide margin.

- **Shell:** top bar with four grouped menus, page index in the left margin.
- **Risk:** 21 destinations one click deeper; square corners break the MASTER radius scale; three columns need 1280px or more.

## Why A

1. It puts "what needs me now" first for all five staff roles using data the API already returns (`DashboardData`, station `queuedAt` and capacity). No new endpoint.
2. Laptop stations suit a labelled sidebar and dense ruled tables.
3. It extends the shipped contract (AppMetricGroup, DataTable, ResourceState, InfoHint) rather than replacing it, keeping phases 01 to 05 small.
4. It is as strong on admin, audit and analytics as on clinical screens.

Option on the table: adopt B's stamps as A's visit-progress language without the folder shell. Decide now if wanted.

## Declined challengers

Airline ticket wallet, dance score, black-and-white data field, streaming poster wall, warm consumer app. Each was rejected as a whole direction; A keeps one idea from each (cancel never delete, length means time, numerals lead, focus dims other rows, accent only on actions). The category standard (shadcn sidebar, KPI cards, charts) stays available if the owner prefers it.

## Owner decisions

1. ~~Direction~~: A approved 2026-11-01. B's stamps were not adopted.
2. **Confirmed 2026-11-01:** Message delivery is a header icon (a send icon, not a bell, so it does not read as an inbox) and Clinic settings moves to the profile menu. Built in #267.
3. **Approved 2026-11-01:** add Manager-only and Director-only E2E identities to the seed, as an owner-approved exception to the epic's no-data-change guardrail. Needed by #269 and #282.

## Decision log

| Date       | Decision                                                            | By    |
| ---------- | ------------------------------------------------------------------- | ----- |
| 2026-11-01 | Station devices are mostly laptops                                  | owner |
| 2026-11-01 | Create all 23 UX sub-issues now (#261 to #283)                      | owner |
| 2026-11-01 | English only for this redesign                                      | owner |
| 2026-11-01 | Direction A, Ruled Chart                                            | owner |
| 2026-11-01 | Message delivery in the header, Clinic settings in the profile menu | owner |
| 2026-11-01 | Add Manager and Director E2E identities to the seed                 | owner |

### Owner update, 2026-11-01

Chart animation is allowed where it improves the experience, with reduced-motion
support and faithful clinical data. Selective shadcn, Bklit and Kokonut components
are welcome after the documented compatibility and accessibility repairs. Sileo
rejection is approved; retain Sonner. Ruled Chart, straight clinical segments,
measured tokens and table alternatives remain the foundation.
