# Nkwapa 2.0 redesign

Epic [#229](https://github.com/akomapahealth/nkwapa/issues/229), November 2026. A workspace-wide
redesign for every account type: volunteers, doctors, managers, directors, system administrators
and patients, plus the public pages and the Keycloak sign-in theme. It changed hierarchy,
navigation, data display, responsiveness and accessibility. **It did not change clinical
behaviour, authorization, data, API responses, feature flags or save semantics.**

The rules that shipped are in [MASTER.md](MASTER.md): section 12 for the Ruled Chart direction,
section 9 for each area's component contract, section 13 for the library decisions. The release
and rollback notes are in [releases/2.0.md](../releases/2.0.md).

## Direction

**Ruled Chart**, approved by the owner on 2026-11-01 over two other concepts. Every screen reads
like a well-kept observation chart: ruled, time-ordered, numbers first. Each staff page leads with
"Needs you now"; waits are bars whose length is minutes; corrections stay visible, struck
through; every chart has a table; teal marks only what can be pressed or is selected.

Owner decisions recorded during the epic:

- Station devices are mostly laptops; the redesign is English only.
- Message delivery (formerly Notifications) is a header icon; Clinic settings is in the account
  menu.
- Manager-only and Director-only test identities were added to the seed, an approved exception
  to the no-data-change rule.
- Selective use of shadcn, Bklit and Kokonut components, and chart animation with reduced-motion
  support, are allowed after compatibility and accessibility repairs. Sileo was rejected; Sonner
  stays as the toast library.

## What shipped

Every issue was its own pull request into `release/dev`. Before and after screenshots, axe scans
and test results for each one are in its pull request on GitHub.

| Issue                                                      | Scope                                     | Pull request                                                                                                                                                                 |
| ---------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#261](https://github.com/akomapahealth/nkwapa/issues/261) | Route, role, component and viewport audit | [#284](https://github.com/akomapahealth/nkwapa/pull/284), [#286](https://github.com/akomapahealth/nkwapa/pull/286)                                                           |
| [#262](https://github.com/akomapahealth/nkwapa/issues/262) | Design research and visual direction      | [#284](https://github.com/akomapahealth/nkwapa/pull/284)                                                                                                                     |
| [#263](https://github.com/akomapahealth/nkwapa/issues/263) | Technical feasibility, self-hosted fonts  | [#287](https://github.com/akomapahealth/nkwapa/pull/287)                                                                                                                     |
| [#264](https://github.com/akomapahealth/nkwapa/issues/264) | Semantic tokens and typography            | [#288](https://github.com/akomapahealth/nkwapa/pull/288)                                                                                                                     |
| [#265](https://github.com/akomapahealth/nkwapa/issues/265) | Shared component foundation               | [#289](https://github.com/akomapahealth/nkwapa/pull/289)                                                                                                                     |
| [#266](https://github.com/akomapahealth/nkwapa/issues/266) | Staff application shell                   | [#290](https://github.com/akomapahealth/nkwapa/pull/290)                                                                                                                     |
| [#267](https://github.com/akomapahealth/nkwapa/issues/267) | Navigation and account utilities          | [#291](https://github.com/akomapahealth/nkwapa/pull/291)                                                                                                                     |
| [#268](https://github.com/akomapahealth/nkwapa/issues/268) | Volunteer and doctor dashboards           | [#292](https://github.com/akomapahealth/nkwapa/pull/292)                                                                                                                     |
| [#269](https://github.com/akomapahealth/nkwapa/issues/269) | Manager, director and admin dashboards    | [#285](https://github.com/akomapahealth/nkwapa/pull/285), [#293](https://github.com/akomapahealth/nkwapa/pull/293)                                                           |
| [#270](https://github.com/akomapahealth/nkwapa/issues/270) | Patient registry and records              | [#294](https://github.com/akomapahealth/nkwapa/pull/294)                                                                                                                     |
| [#271](https://github.com/akomapahealth/nkwapa/issues/271) | Stations and screenings                   | [#295](https://github.com/akomapahealth/nkwapa/pull/295), [#296](https://github.com/akomapahealth/nkwapa/pull/296), [#297](https://github.com/akomapahealth/nkwapa/pull/297) |
| [#272](https://github.com/akomapahealth/nkwapa/issues/272) | Queues and encounters                     | [#298](https://github.com/akomapahealth/nkwapa/pull/298)                                                                                                                     |
| [#273](https://github.com/akomapahealth/nkwapa/issues/273) | Appointments and follow-up                | [#299](https://github.com/akomapahealth/nkwapa/pull/299)                                                                                                                     |
| [#274](https://github.com/akomapahealth/nkwapa/issues/274) | Administration and governance             | [#301](https://github.com/akomapahealth/nkwapa/pull/301)                                                                                                                     |
| [#275](https://github.com/akomapahealth/nkwapa/issues/275) | Analytics and reporting                   | [#300](https://github.com/akomapahealth/nkwapa/pull/300)                                                                                                                     |
| [#276](https://github.com/akomapahealth/nkwapa/issues/276) | Patient portal                            | [#302](https://github.com/akomapahealth/nkwapa/pull/302)                                                                                                                     |
| [#277](https://github.com/akomapahealth/nkwapa/issues/277) | Authentication and onboarding             | [#303](https://github.com/akomapahealth/nkwapa/pull/303)                                                                                                                     |
| [#278](https://github.com/akomapahealth/nkwapa/issues/278) | Public landing page                       | [#304](https://github.com/akomapahealth/nkwapa/pull/304)                                                                                                                     |
| [#279](https://github.com/akomapahealth/nkwapa/issues/279) | Public navigation and supporting pages    | [#305](https://github.com/akomapahealth/nkwapa/pull/305)                                                                                                                     |
| [#280](https://github.com/akomapahealth/nkwapa/issues/280) | Motion and feedback                       | [#306](https://github.com/akomapahealth/nkwapa/pull/306)                                                                                                                     |
| [#281](https://github.com/akomapahealth/nkwapa/issues/281) | Responsive and offline refinements        | [#308](https://github.com/akomapahealth/nkwapa/pull/308)                                                                                                                     |
| [#282](https://github.com/akomapahealth/nkwapa/issues/282) | Full regression and accessibility QA      | [#309](https://github.com/akomapahealth/nkwapa/pull/309)                                                                                                                     |
| [#283](https://github.com/akomapahealth/nkwapa/issues/283) | Release readiness and documentation       | [#310](https://github.com/akomapahealth/nkwapa/pull/310)                                                                                                                     |

The final route audit (#282) covered six identities and 57 routes: 224 axe scans with zero
serious or critical findings.

## Follow-ups outside the epic

- [#307](https://github.com/akomapahealth/nkwapa/issues/307): idempotency keys for direct online
  writes (needs an API change).
- [#207](https://github.com/akomapahealth/nkwapa/issues/207): cold-start offline sign-in, a
  separate security-scoped feature.

## Working rules that held

- Branch every issue from `release/dev`; never stack pull requests into parent branches.
- Local end-to-end runs need the CI environment (feature flags including `NEXT_PUBLIC_*`, rate
  limits, mail) and a rebuild. Run Playwright with one worker and Jest with at most two.
- A full reseed desyncs the Keycloak subjects in `.env`; every staff route then says "No clinic
  selected".
- Seeded or synthetic data only in screenshots, docs, pull requests and artifacts.

## Log

| Date       | Entry                                                                                                                                                                                                                                                                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-01 | Phase 00 baseline and audit; three directions reviewed; Ruled Chart approved; #261 to #283 created.                                                                                                                                                                                                                  |
| 2026-11-02 | Foundations, shell, navigation and dashboards merged (#284 to #293).                                                                                                                                                                                                                                                 |
| 2026-11-03 | Registry, stations, queues, appointments, administration and analytics merged (#294 to #301).                                                                                                                                                                                                                        |
| 2026-11-04 | Portal, sign-in, landing, public pages, motion, responsive and offline, and route QA merged (#302 to #309). #261 to #282 closed.                                                                                                                                                                                     |
| 2026-11-04 | Started #283 (UX-23) from release/dev at adf1f1a on `docs/283-release-readiness`.                                                                                                                                                                                                                                    |
| 2026-11-04 | #283: opened [PR #310](https://github.com/akomapahealth/nkwapa/pull/310) into release/dev. Evidence and stale docs removed, docs index, getting started and operations guides, new README, MASTER.md by product area, 2.0 release and rollback notes awaiting owner approval. Pending owner review and manual merge. |
