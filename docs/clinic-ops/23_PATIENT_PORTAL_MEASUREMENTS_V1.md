# 23. Patient Portal Measurements V1

## Status

Implemented for the core portal measurement and trends flow.

The broader patient portal is still evolving, so use `IMPLEMENTATION_STATUS.md` and `docs/FEATURE_WORKFLOWS_GUIDE.md` for the live feature surface.

---

## Goal

Patients self-log measurements (BP, glucose, weight). Staff can view in patient chart and trends.

Prisma

PatientAccountLink

Fields:
• id, patientId, keycloakSub
• timestamps
Unique:
• keycloakSub

PatientMeasurement

Fields:
• id, patientId
• recordedAt
• source enum: PATIENT | STAFF
• type enum: BP | GLUCOSE | WEIGHT
• payloadJson (JSON)
• notes?
• linkedEncounterId?
• timestamps

Indexes:
• (patientId, recordedAt)
• (patientId, type, recordedAt)

Endpoints

Patient
• POST /patients/me/measurements
• GET /patients/me/measurements?type=&from=&to=

Staff
• GET /patients/:patientId/measurements?from=&to= requires PATIENT_READ

Validation rules
• BP payload must include systolic/diastolic; optional pulse
• glucose payload must include value and type FASTING/RANDOM
• enforce sane ranges (don’t overdo; basic constraints only)

Audit events
• MEASUREMENT.CREATE (for both patient and staff source)

⸻

## Offline read cache (#18)

The portal stays online-only for writes, but a patient's recent history no longer vanishes when
the connection drops or the API does not answer.

### What is kept

Overview, My Health (one copy per time window) and Appointments each keep their last good load
in the Dexie `portal_cache` store (schema v13). A copy is written only after a live load
succeeds. Before it is written, fields the history screens never render are stripped: the
patient's date of birth and sex, and the staff-only patient summary on appointment requests.

| Field       | Meaning                                                            |
| ----------- | ------------------------------------------------------------------ |
| `key`       | `${userId}\|${clinicId}\|${view}\|${variant}`                      |
| `userId`    | The signed-in account (`whoami.userId`). Indexed for purges.       |
| `clinicId`  | The active portal clinic.                                          |
| `patientId` | The patient record the server returned, or null for an empty view. |
| `variant`   | What else shapes the view, e.g. `90` for the 90-day Health window. |
| `updatedAt` | When the copy was saved. Shown to the patient.                     |

### When a copy is shown

- **Offline**: the read is not attempted; the saved copy is shown under a "You are offline"
  notice that gives the time it was saved and says what needs a connection. The read runs again
  by itself when the connection returns.
- **No answer** (network error, timeout, 5xx, 408, 429): the saved copy is shown under a
  "Showing a saved copy" notice with a Try again button.
- **Refused** (401, 403, unlinked record, any other 4xx): the copy for that view is deleted and
  the error is shown. Withdrawn access must not keep rendering the old record.

A copy is only read back for the same account, clinic, view and variant, and never after
seven days.

### Session isolation

- **Sign out** clears the whole store before redirecting to Keycloak (bounded at 750 ms so a slow
  IndexedDB cannot hang sign-out).
- **Account resolved**: whenever `whoami` resolves an account, rows for any other account and
  expired rows are deleted. This covers sessions that end without Sign out: an expired token, a
  closed tab, another account signed in from a second tab.

### Writes

Logging a reading, requesting a visit, and requesting a cancellation or reschedule all still
require a live API success. Offline, their submit buttons are disabled with the reason beside
them and nothing is queued. Cancellation and reschedule are also held back while a saved copy is
on screen, because the appointment it shows may already have changed.

### Manual QA

1. Sign in as a patient, open My Health and Appointments.
2. DevTools → Network → Offline. Move between Overview, My Health and Appointments with the
   portal nav: each shows its saved copy with the offline notice and its saved time.
3. Open Request Visit and Log a reading: submit is disabled and says why.
4. Go back online: the notices clear and the forms enable without a reload.
5. Sign out, sign in as another patient on the same browser: Application → IndexedDB →
   `NkwapaDb` → `portal_cache` holds only the new account's rows.
