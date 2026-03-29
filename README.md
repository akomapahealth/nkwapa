# Nkwapa EMR

[![Akomapa website](https://img.shields.io/badge/Akomapa-akomapa.org-2e7d32?style=for-the-badge)](https://akomapa.org)
[![CI](https://github.com/akomapahealth/nkwapa/actions/workflows/ci.yml/badge.svg)](https://github.com/akomapahealth/nkwapa/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

**Nkwapa** is a multi-clinic electronic medical record (EMR) platform focused on **hypertension** and **diabetes** care pathways. It is built for community health programs that need dependable clinical documentation, operational visibility, and responsible handling of sensitive patient data.

The system is developed in support of [**Akomapa**](https://akomapa.org)—the nonprofit behind community-driven screening, education, and longitudinal care for non-communicable diseases.

---

## What the platform does

Nkwapa ties together **frontline intake**, **structured encounters**, **vitals and screening workflows**, **care planning**, **prescribing**, **patient engagement** (including reminders), and **research-grade export**—all under **role-based access** and **clinic-level isolation**. The goal is a single source of truth for clinic operations while staying practical for low-connectivity and high-throughput field settings.

---

## Capabilities

- **Clinic operations** — Shifts, check-ins, queue-style boards, and assignments so teams can coordinate who is working, who is waiting, and who is responsible for each step of care.
- **Clinical documentation** — Encounters with screening modules (e.g. vitals, diabetes, hypertension), care plans, and prescriptions tied to a shared patient record and drug catalog.
- **Identity-aware access** — Staff permissions are modeled explicitly; actions are scoped to the clinic context so users only work within what they are authorized to see and change.
- **Audit and accountability** — Important writes are recorded for traceability, supporting quality improvement and governance expectations.
- **Offline-first web experience** — The patient-facing and field workflows are designed around resilient sync: capture data locally when connectivity is poor, then reconcile when the network is available.
- **Research and reporting** — Controlled export pipelines support de-identified datasets and approval workflows, so program data can support evidence and partnerships without sacrificing patient trust.
- **Patient touchpoints** — Appointment requests, portal-style self-service where appropriate, and reminder channels help close the loop between visits.

---

## Architecture (overview)

Nkwapa is maintained as a **TypeScript monorepo**: a **NestJS** API for business rules and integrations, a **Next.js** progressive web application for staff and patients, and a **PostgreSQL** data layer with a versioned schema. Authentication integrates with **Keycloak** (OpenID Connect / JWT), aligning enterprise identity practices with nonprofit deployment realities.

---

## License and organization

This project is licensed under the **GNU General Public License v3.0**—see [`LICENSE`](LICENSE). For more about Akomapa’s mission, programs, and how to engage with the organization, visit **[akomapa.org](https://akomapa.org)**.
