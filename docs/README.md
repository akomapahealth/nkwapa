# Nkwapa documentation

Start with [Getting started](GETTING_STARTED.md) if you are setting up a machine, or with the
[architecture overview](specs/01_ARCHITECTURE_OVERVIEW.md) if you want the shape of the system
first. Some file names below are fixed because code, tests or scripts read them, so they keep
their original names.

## Set up and run

| Document                                                     | Read it for                                                                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [GETTING_STARTED.md](GETTING_STARTED.md)                     | First run on your machine: services, database, test accounts, running the apps, checks before you push      |
| [DATABASE_SETUP.md](DATABASE_SETUP.md)                       | Connections, seeding, row-level security, clinic metadata, Keycloak maintenance, troubleshooting            |
| [USER_AND_ROLE_SETUP_GUIDE.md](USER_AND_ROLE_SETUP_GUIDE.md) | Roles and permissions, the first system admin, staff invites, portal accounts, deactivation, password reset |

## Architecture and system specs

| Document                                                                            | Read it for                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [01 Architecture overview](specs/01_ARCHITECTURE_OVERVIEW.md)                       | Apps, services, the request and access flow, cross-cutting rules |
| [02 Domain model and data dictionary](specs/02_DOMAIN_MODEL_AND_DATA_DICTIONARY.md) | The Prisma model, scoping rules, encounter states                |
| [03 Auth and RBAC](specs/03_AUTH_AND_RBAC.md)                                       | Keycloak, roles, permissions, clinic and zone scoping            |
| [04 Offline first and sync](specs/04_OFFLINE_FIRST_AND_SYNC.md)                     | The outbox, sync, the service worker and installed app           |
| [15 Telemetry and metrics](specs/15_TELEMETRY_AND_METRICS.md)                       | What is counted, and what never is                               |

## Features and clinical workflows

[FEATURE_WORKFLOWS_GUIDE.md](FEATURE_WORKFLOWS_GUIDE.md) is the walkthrough of the product as it
works today, role by role, including feature flags. The specs below hold the detailed rules for
each area.

| Area                      | Specs                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patients and identity     | [06 Patients module](specs/06_PATIENTS_MODULE.md), [13 Patient identity release gate](specs/13_PATIENT_IDENTITY_RELEASE_GATE.md)                                                                                                                                                                                                               |
| Clinical records          | [07 Medical history](specs/07_MEDICAL_HISTORY_AND_ALLERGIES.md), [08 Medication reconciliation](specs/08_MEDICATION_RECONCILIATION_AND_PHARMACIES.md), [09 Diabetes screening](specs/09_DIABETES_SCREENING.md), [10 Clinical notes](specs/10_CLINICAL_NOTES.md), [11 Clinical records release gate](specs/11_CLINICAL_RECORDS_RELEASE_GATE.md) |
| Hypertension and diabetes | [14 Chronic disease interviews](specs/14_CHRONIC_DISEASE_INTERVIEWS.md); [HTN and diabetes workflows V1](specs/HTN_DIABETES_WORKFLOWS_V1.md) (superseded, kept for the staging bands and thresholds)                                                                                                                                           |
| Appointments              | [12 Appointment operations release gate](specs/12_APPOINTMENT_OPERATIONS_RELEASE_GATE.md), [22 Appointments calendar](clinic-ops/22_APPOINTMENTS_CALENDAR_V1.md)                                                                                                                                                                               |
| Clinic operations         | [20 Shifts and staff check-in](clinic-ops/20_SHIFTS_AND_STAFF_CHECK_IN_V1.md), [21 Patient check-in and assignments](clinic-ops/21_PATIENT_CHECKIN_AND_ASSIGNMENTS_V1.md), [27 Station workflow](clinic-ops/27_STATION_WORKFLOW_V1.md)                                                                                                         |
| Patient portal            | [23 Portal measurements](clinic-ops/23_PATIENT_PORTAL_MEASUREMENTS_V1.md)                                                                                                                                                                                                                                                                      |
| Administration            | [24 Deactivation and access lifecycle](clinic-ops/24_ADMIN_DEACTIVATION_AND_ACCESS_LIFECYCLE_V1.md)                                                                                                                                                                                                                                            |
| Analytics and research    | [25 Trends and analytics](clinic-ops/25_TRENDS_AND_ANALYTICS_V1.md), [26 Research export transforms](clinic-ops/26_RESEARCH_EXPORT_TRANSFORMS_V1.md), [28 Reading the research dataset](clinic-ops/28_READING_THE_RESEARCH_DATASET.md), [Consent and research gating](specs/CONSENT_AND_RESEARCH_GATING_V1.md)                                 |
| Messages and reminders    | [Notifications, SMS and email](specs/NOTIFICATIONS_SMS_EMAIL_V1.md)                                                                                                                                                                                                                                                                            |

## Testing

[USER_TESTING_GUIDE.md](USER_TESTING_GUIDE.md) is the manual QA and acceptance checklist: the test
accounts, what CI already proves, and the role-by-role matrices.

## Operations and deploy

[OPERATIONS.md](OPERATIONS.md): environments, the deploy pipeline, the live status and post-deploy
gate, rollback, and the Keycloak service account each environment needs. Environment templates are
in [`deploy/env/`](../deploy/env/).

## Security and privacy

| Document                                                                     | Read it for                                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [03 Auth and RBAC](specs/03_AUTH_AND_RBAC.md)                                | The access model                                                 |
| [Clinical records role matrix](security/clinical-records-role-matrix.md)     | Who can read and write each clinical record                      |
| [Appointment lifecycle matrix](security/appointment-lifecycle-matrix.md)     | Appointment transitions and their permissions                    |
| [Patient identity matrix](security/patient-identity-matrix.md)               | Registration, claiming, merging and identity rules               |
| [Offline and job execution matrix](security/offline-job-execution-matrix.md) | What runs offline or in background jobs, and under which context |

The four matrices are generated from code (`npm run docs:*-matrix --workspace=@nkwapa/api`) and
tests fail when they drift, so edit the source in `apps/api/src/testing/`, not the Markdown. The
privacy policy and terms that users read are the `/privacy` and `/terms` pages in the web app.

## Design system

| Document                                                        | Read it for                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [MASTER.md](design-system/MASTER.md)                            | The one design reference: tokens, type, motion, component and form contracts, the Ruled Chart rules |
| [REDESIGN-2.0.md](design-system/REDESIGN-2.0.md)                | The Nkwapa 2.0 redesign: direction, decisions, and the pull request for each area                   |
| [Landing page decision record](design/landing-page-redesign.md) | Why the public home page says what it says, and what it may not claim                               |
| [`apps/web/PRODUCT.md`](../apps/web/PRODUCT.md)                 | Users, purpose and constraints, as context for design tools                                         |

## Releases

| Document               | Read it for                                     |
| ---------------------- | ----------------------------------------------- |
| [2.0](releases/2.0.md) | The Nkwapa 2.0 release notes and rollback notes |

Earlier releases are on the [GitHub releases page](https://github.com/akomapahealth/nkwapa/releases).
