# Docs Index

## Purpose

This index separates current source-of-truth docs from older planning material.

Use this file first when you need to answer one of these questions:

- What is implemented right now?
- Which docs are authoritative?
- Which specs are still useful but no longer current?

---

## Status Labels

- `Current`: Matches the live codebase and should be treated as authoritative.
- `Current with follow-on work`: Matches the shipped implementation, but explicitly calls out known gaps or next additions.
- `Planning / historical`: Useful context, but not a source of truth for the current repo state.

---

## Current Source-Of-Truth Docs

| Document                                                    | Status                      | Use it for                                                                       |
| ----------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------- |
| `IMPLEMENTATION_STATUS.md`                                  | Current with follow-on work | Product-wide implementation snapshot and gap map                                 |
| `docs/security-audit-2026-04-04.md`                         | Current                     | Security posture, hardening decisions, and residual risks                        |
| `docs/FEATURE_GAPS_AND_NEXT_ADDITIONS.md`                   | Current                     | Prioritized list of partially completed areas and recommended additions          |
| `docs/PRIORITIZED_IMPLEMENTATION_PLAN.md`                   | Current                     | Phase-based execution roadmap with concrete tickets and sequencing               |
| `docs/DATABASE_SETUP.md`                                    | Current                     | Local/remote DB setup, migrate/generate workflow, pooled vs direct connections   |
| `docs/FEATURE_WORKFLOWS_GUIDE.md`                           | Current with follow-on work | Operator-facing workflow map across staff, admin, and portal surfaces            |
| `docs/USER_AND_ROLE_SETUP_GUIDE.md`                         | Current                     | How identity, local roles, portal access, and lifecycle setup work               |
| `docs/USER_TESTING_GUIDE.md`                                | Current with follow-on work | Smoke/UAT checks for the current product surface                                 |
| `docs/specs/01_ARCHITECTURE_OVERVIEW.md`                    | Current                     | Repo/runtime architecture and cross-cutting design rules                         |
| `docs/specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md`         | Current                     | Current schema/domain model and scoping rules                                    |
| `docs/specs/03_AUTH_AND_RBAC.md`                            | Current                     | Auth, RBAC, permissions, and onboarding model                                    |
| `docs/specs/04_OFFLINE_FIRST_AND_SYNC.md`                   | Current with follow-on work | Current offline scope, sync model, and limitations                               |
| `docs/specs/06_PATIENTS_MODULE.md`                          | Current with follow-on work | Current patient registry, portal link/invite, and merge behavior                 |
| `docs/specs/07_MEDICAL_HISTORY_AND_ALLERGIES.md`            | Current                     | Longitudinal history, allergy safety, rollout, and release-gate contract         |
| `docs/specs/08_MEDICATION_RECONCILIATION_AND_PHARMACIES.md` | Current                     | Reported medications, pharmacy history, offline conflicts, and rollout           |
| `docs/specs/09_DIABETES_SCREENING.md`                       | Current                     | Diabetes record, compatibility, access, downstream, and release-gate contract    |
| `docs/specs/10_CLINICAL_NOTES.md`                           | Current                     | HAP lifecycle, clinical access boundary, immutability, rollout, and release gate |
| `docs/clinic-ops/26_RESEARCH_EXPORT_TRANSFORMS_V1.md`       | Current                     | Research export v1 compatibility and v2 pipeline contract                        |

---

## Planning / Historical Docs

These files are still worth keeping, but they should not be treated as the current contract without cross-checking the live codebase and the docs above.

| Document or group                            | Status                                       | Notes                                                                         |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| `docs/specs/initial_setup.md`                | Planning / historical                        | Old bootstrap artifact; replaced by current setup and architecture docs       |
| `docs/clinic-ops/20_*.md` through `25_*.md`  | Planning with partial implementation overlap | Useful feature intent docs; some flows are now fully or partially implemented |
| `docs/clinic-ops/big_picture.md`             | Planning / historical                        | Early product expansion framing                                               |
| `docs/clinic-ops/build_philosphy.md`         | Planning / historical                        | Early sequencing and design tradeoffs                                         |
| `docs/clinic-ops/ui_implementation_specs.md` | Planning with partial implementation overlap | UI intent doc; current app has diverged in details                            |
| `docs/specs/UI_*.md`                         | Planning / historical                        | UI planning notes rather than live product contract                           |

---

## Recommended Reading Order

1. `IMPLEMENTATION_STATUS.md`
2. `docs/specs/01_ARCHITECTURE_OVERVIEW.md`
3. `docs/specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md`
4. `docs/specs/03_AUTH_AND_RBAC.md`
5. `docs/specs/04_OFFLINE_FIRST_AND_SYNC.md`
6. `docs/FEATURE_WORKFLOWS_GUIDE.md`
7. `docs/FEATURE_GAPS_AND_NEXT_ADDITIONS.md`
8. `docs/PRIORITIZED_IMPLEMENTATION_PLAN.md`
