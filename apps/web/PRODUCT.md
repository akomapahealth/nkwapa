# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Volunteers and nurses** at screening stations. They register patients and capture vitals, glucose, anthropometry, eye checks and counselling. On a screening day they work mostly on **shared clinic laptops** (confirmed 2026-11-01); phones are a fallback. Throughput matters more than anything else on their screen.
- **Doctors.** They review encounters, cosign HAP (hypertension action plan) notes, finalize visits and set follow-up.
- **Managers.** They run the day: the station line, check-in, assignments, queues, staffing.
- **Directors.** They oversee one clinic: activity, screening coverage, follow-up, documentation quality, audit, research exports.
- **System administrators.** They work across clinics: clinics, staff and roles, duplicates, organization reporting.
- **Patients.** They use the portal, mostly on phones: appointments, their own measurements, self-reports.

One person can hold several roles at one clinic and different roles at different clinics.

## Product Purpose

Nkwapa is the electronic medical record and clinic-workflow system for Akomapa Health's community clinics and screening days in Ghana, focused on hypertension, diabetes and NCD screening. It joins registration, station measurements, clinical encounters, doctor review and follow-up into one record, so the doctor sees what every station recorded and the next visit starts from history rather than nothing. Success: every role knows what needs them now, and no clinical work is lost when the connection drops.

## Positioning

Built around the physical screening day: a patient walks between stations, each station writes into one shared visit, and the work survives intermittent clinic Wi-Fi through an offline outbox that replays when the signal returns. It is a clinical instrument for a specific operational reality, not a general practice-management suite.

## Operating Context

- Screening days with a station line (registration and medical history, blood pressure, glucose, anthropometry, eye, counselling and clinical review), plus ordinary clinic days.
- Clinic Wi-Fi is slow, intermittent or absent. The app is an installable PWA with an offline outbox, a sync center, and held changes per clinic and per account.
- Times are shown in Africa/Accra.
- Authentication is Keycloak. The login theme is a separate deployment that mirrors the web tokens.

## Capabilities and Constraints

- Role- and permission-driven navigation (`apps/web/lib/app-nav.ts`), clinic scoping, feature flags, route guards. None of this may change in the redesign.
- "Notifications" is the **outbound message delivery ledger**, not a personal inbox. There are no unread counts. "Clinic settings" is clinic research configuration, not personal preferences.
- Clinical fields, units, validation, defaults and save semantics are fixed. The redesign changes layout and presentation only.
- Stack is fixed for this redesign: Next 16.3 canary, React 18.3, Tailwind 3.4, shadcn (new-york) on Radix, lucide icons, Recharts 3, TanStack Table 9, Sonner 2, framer-motion 12. No upgrades without a separate issue.
- Language: **English only** for this redesign (confirmed 2026-11-01).

## Brand Commitments

- Logo teal `#008DA3` and logo gold `#FFCD1A` (wordmark "nkwapa" with a gold plus). Accessible action teal `#00778A` is derived by lightness only.
- Source Serif 4 for headings, IBM Plex Sans for interface and data. Brief-pinned; do not replace.
- Teal-tinted canvas `#F2F7F7` with one white sheet `#FFFFFF` on it, ink `#19282E`, every neutral tinted from the logo teal (Layered Clinical Workspace, UI refresh R1.1). Values and their measured contrast live in `docs/design-system/ui-refresh/R0-AUDIT.md` section 4, mirrored in `docs/design-system/MASTER.md`.
- Heidi Health is a quality reference only. Its burgundy and yellow, logo, fonts and layouts are not to be reproduced.
- Target identity named by the client: "Modern Clinical Editorial". Calm, warm, trustworthy, efficient.

## Evidence on Hand

- Real photographs of Akomapa screening days are used on the landing page (`apps/web/public/`).
- Real product screenshots, generated from seeded E2E data.
- **No verified testimonials, customer counts, screening totals or outcome figures.** The 2026-10 landing redesign removed invented ones (`docs/design/landing-page-redesign.md`). Do not add any without a source.
- Screenshots and artifacts must use seeded or synthetic patients only. Production data (for example the 68 patients imported 2026-10-12) never appears in design material.

## Product Principles

1. What needs me now comes before trends.
2. Never blank the screen and never conceal unsynced work; an empty state is never shown when the real problem is the network.
3. Irreversible actions (finalize, merge, consent, delete) look different from routine ones.
4. Clinical values are always labeled with units and never carried by colour alone.
5. Every element earns its place: no decoration that does not help someone finish clinical work.

## Accessibility & Inclusion

WCAG 2.2 AA throughout. Touch targets at least 44px in the staff app and the portal; on a mouse, buttons are 36px and fields 40px, with small and icon buttons keeping a 44px hit area (owner decision 2026-11-10). Keyboard reachable, visible focus, reduced motion respected, light and dark themes both designed and measured. Plain-language labels for non-technical staff and patients.
