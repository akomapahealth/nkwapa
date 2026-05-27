# User Testing Guide

This guide is the current manual QA and user acceptance checklist for the implemented product surface.

Use it when validating releases, new role setup, workflow changes, or the safety of major infrastructure updates.

---

## 1. Prerequisites

Make sure these services are available:

- Postgres
- Redis
- Keycloak
- API
- Web app

Local infra:

```bash
cd infra/nkwapa
docker compose up -d
```

Then sync and seed the database:

```bash
npm run db:migrate:dev
npm run db:generate
npm run db:seed
npm run e2e:keycloak-user
```

Useful seed inputs:

- `SEED_SYSTEM_ADMIN_SUB`
- `SEED_SYSTEM_ADMIN_NAME`
- `SEED_E2E_STAFF_SUB`
- `SEED_E2E_STAFF_NAME`
- `SEED_E2E_STAFF_EMAIL`
- `SEED_SAMPLE_PATIENT=true`

---

## 2. Suggested Accounts

Create at least:

- one `SYSTEM_ADMIN`
- one `DIRECTOR`
- one `MANAGER`
- one `DOCTOR`
- one `VOLUNTEER`
- one `PATIENT`

Recommended extra accounts:

- one multi-role clinic staff account for permission overlap testing
- one patient account intended for invite-and-claim testing

---

## 3. Global Smoke Test

1. Open the web app.
2. Confirm `/` stays on the marketing landing page and does not show a sign-in CTA.
3. Confirm an unauthenticated visit to `/dashboard` redirects to `/login?next=...`.
4. Confirm `/login` redirects to Keycloak after clicking the secure sign-in button.
5. Log in.
6. Confirm `/auth/whoami` bootstraps successfully.
7. Confirm the app loads without raw crash output.
8. Confirm clinic switching works for multi-clinic users.
9. Confirm logout and re-login work.

Also verify:

- no obvious blank screen on initial load
- route loading skeleton appears when the app is still resolving
- page-level retry actions exist for recoverable failures
- landing page buttons only scroll within the page and do not jump directly into app sign-in

---

## 4. Security And Tenant Isolation Smoke

- [ ] allowed frontend origins can call the API
- [ ] a disallowed origin is rejected by CORS
- [ ] a clinic-scoped user cannot access another clinic's records
- [ ] a system admin can access cross-clinic administrative views
- [ ] rate-limited endpoints return `429` with a readable recovery message
- [ ] API failures return a structured error with a request ID

---

## 5. System Admin Matrix

- [ ] `/admin/clinics` loads
- [ ] `/admin/users` loads
- [ ] create clinic works
- [ ] assign clinic roles works
- [ ] global `SYSTEM_ADMIN` assignment works
- [ ] user deactivation works
- [ ] self-deactivation is blocked
- [ ] duplicate patient merge succeeds for same-clinic charts

---

## 6. Director Matrix

- [ ] clinic settings page loads
- [ ] research toggles persist
- [ ] research export request succeeds
- [ ] approval and rejection actions work
- [ ] completed export shows metadata and artifact actions
- [ ] clinic-scoped admin user actions respect allowed bounds
- [ ] audit page loads

---

## 7. Manager Matrix

- [ ] `/today` loads
- [ ] active shifts render
- [ ] patient check-ins group correctly by status
- [ ] assignment modal only shows active eligible staff
- [ ] reassignment works
- [ ] clinic user lifecycle actions work within allowed scope
- [ ] dashboard and audit views load

---

## 8. Volunteer Matrix

- [ ] `/patients` loads
- [ ] patient create works
- [ ] patient detail loads
- [ ] encounter create works
- [ ] vitals and screening save
- [ ] consent grant and revoke work
- [ ] `/my/assigned` loads
- [ ] start intake from assigned patient works

---

## 9. Doctor Review Matrix

- [ ] queues page shows review workload
- [ ] in-review encounter loads
- [ ] clinical review action works
- [ ] finalize remains disabled until review is complete

---

## 10. Doctor Finalization Matrix

- [ ] queues page shows finalize-ready encounters
- [ ] care plan save works
- [ ] prescription create/update/delete works before finalization
- [ ] encounter finalization works
- [ ] finalized encounter becomes read-only
- [ ] follow-up reminder is created when follow-up date exists

---

## 11. Patient Portal Matrix

- [ ] patient with pending invite is routed to `/claim-record`
- [ ] claim-record succeeds with valid matching details
- [ ] `/portal` loads after successful claim
- [ ] measurement logging works
- [ ] self-report submission works
- [ ] appointment request creation works
- [ ] trend views render usable data

---

## 12. UX Recovery Matrix

- [ ] loading skeleton appears for route-level loads
- [ ] not-found page shows recovery actions
- [ ] simulated page error shows retry and refresh options
- [ ] network failure shows readable retry guidance instead of raw exceptions
- [ ] server-side validation errors surface field-level or clear actionable messages

---

## 13. Responsive And Chat Matrix

- [ ] landing page is readable and unclipped at `375`, `768`, `1024`, and `1440` widths
- [ ] dashboard cards wrap cleanly without horizontal page overflow at the same widths
- [ ] tables stay inside scroll containers instead of forcing full-page overflow
- [ ] mobile nav drawer opens and closes cleanly on phone widths
- [ ] sidebar collapse state still works on laptop and desktop widths
- [ ] chat toggle stays visible above page content on every breakpoint
- [ ] chat panel opens within the viewport on phone and tablet sizes
- [ ] chat panel is visibly larger on desktop without covering the full screen

---

## 14. Partial Areas To Test Carefully

These areas are implemented but still worth extra regression attention:

- appointment workflows beyond basic request/confirm/reject
- offline behavior outside the original EMR flow
- portal invite and claim edge cases
- duplicate patient merge and canonical-chart redirects
- organization and zone-related assumptions in new features
