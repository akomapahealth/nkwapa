# Offline Session Matrix

Written by hand for #207, unlike the generated matrices beside it: it records a threat model and
the decisions taken against it, not a table a spec can own. Update it with any change to
`apps/web/lib/offline-session/`, `apps/web/lib/pwa/service-worker.js` or
`apps/api/src/offline-grants/`.

A staff member who opted in on a device can open the installed app with no connection, unlock it
with a PIN or a passkey, and keep working within the scope that already works offline. Nothing is
sent until they sign in with a connection.

## Threat model

| Actor                                                                   | Has                                    | Must not be able to                                                                | What stops them                                                                                                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The next staff member on a shared clinic laptop                         | The device, their own account          | Act as the previous person, or read what only that person's session could          | Each person's grant and data key are wrapped by their own PIN or passkey. The outbox sends only its owner's rows (#162). Sign-out asks whether to keep offline access and defaults to removing it.                           |
| Someone who finds or steals a device                                    | The device, no credentials             | Read patient data, or queue writes attributed to the owner                         | Clinical tables are encrypted at rest under keys that exist only in memory after unlock. Five wrong PINs delete the grant and wrapped key. The server refuses pushes under a revoked or expired grant.                       |
| A staff member offboarded while the device was offline                  | An old grant                           | Keep acting past a bounded window, or have queued writes accepted after revocation | Grants last 72 hours from the last online sign-in. Offboarding, role removal and the admin action revoke every grant; the server refuses pushes stamped with one.                                                            |
| A technical attacker with devtools on a **locked** or signed-out device | IndexedDB, Cache Storage, localStorage | Read clinical values                                                               | Rows on disk are AES-GCM ciphertext; only primary keys and non-clinical index fields are clear. Cache Storage holds page shells only. No Keycloak token is ever written anywhere.                                            |
| A technical attacker with devtools on an **unlocked** session           | The running page                       | (Not stopped)                                                                      | Nothing. The app shows these values to whoever is at the screen, and devtools can read the page, its memory and the service worker's memory. Lock, idle lock and the grant lifetime bound this window; they do not close it. |
| A family member on a patient's phone                                    | The device                             | (Out of scope for v1)                                                              | Patients never get a grant. The portal keeps its read-only cache, encrypted under the patient's own key.                                                                                                                     |

## What client-side checks do and don't stop

Anything enforced only in the browser stops a person using the app, not a person with devtools.

| Check                                      | Runs in                                 | Stops                                                    | Does not stop                                                                          |
| ------------------------------------------ | --------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| The unlock screen                          | Browser                                 | Someone tapping through the app                          | Nothing on its own. The encryption is what protects a locked device.                   |
| Five-attempt lockout                       | Browser (counter in IndexedDB)          | A passer-by guessing PINs                                | An attacker who copies the IndexedDB file and guesses offline. See the PIN caveat.     |
| Grant expiry on unlock                     | Browser, against the signed `expiresAt` | Unlocking with a stale grant by accident                 | An edited device clock. The server checks expiry again at push time, on its own clock. |
| Idle lock (10 minutes)                     | Browser                                 | A device left open on a desk                             | Someone already at the unlocked screen.                                                |
| Grant signature (ES256)                    | Browser                                 | A stale or hand-edited grant being trusted by mistake    | A devtools attacker, who can skip the check. The server refuses what it did not issue. |
| Push refusal for revoked or expired grants | **Server**                              | Writes queued under a grant that is no longer valid      | Reading data already on an unlocked device.                                            |
| Encryption at rest                         | Browser, keys from the server           | Reading a locked device, a copied profile, a lost laptop | An unlocked session.                                                                   |

## The PIN caveat

A 6-digit PIN has a million values. Someone holding a copy of the IndexedDB files can try them
offline, without the five-attempt limit. PBKDF2-SHA-256 at 600,000 iterations makes each guess
cost a fraction of a second on a laptop, so the whole space falls in hours to days on one machine,
faster on a GPU. Longer PINs (up to 12 digits) and passkeys raise that cost. What bounds the damage
is the grant lifetime (72 hours) and server-side revocation: offboard or revoke as soon as a device
is lost.

## Decisions

| ID  | Decision                                                                                         | Why                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | A signed, server-issued offline grant survives a restart, never a Keycloak token                 | A persisted refresh token outlives its owner on a shared device. The grant names one device and expires.                                      |
| R2  | Staff roles only (doctor, volunteer, manager, director); never system admins or patients         | Admin work is online work and has the widest blast radius. Patients need a different trust decision (#207 R9).                                |
| R2  | 72-hour lifetime from the last online sign-in; 10-minute idle lock; opt-in per device            | Clinics lose signal for hours, not weeks. Opting in is when the PIN is set.                                                                   |
| R3  | Option C: every clinical table encrypted at rest, not only the outbox                            | B left offline-authored values readable. One Dexie middleware covers every table; indexes that held clinical values were dropped (Dexie v16). |
| R4  | PIN required, passkey with PRF optional                                                          | The PIN works everywhere and is the way back in when a passkey stops working.                                                                 |
| R4  | Key loss: the server escrows the data key, released only to an online session of the same person | An unrecoverable clinical write is worse than escrow, and the server holds the data once it syncs.                                            |
| R5  | Identity comes from the grant in whoami's own shape; `getToken` returns null                     | Route guards, navigation and permission checks work unchanged and cannot widen.                                                               |
| R6  | Exactly the scope that already works offline                                                     | No new offline writes. A chart reaches a cold start only if it was opened online on this device (see below).                                  |
| R7  | Nothing is pushed without a live token; sign-in is the reconnect                                 | Sync is off for the whole offline session. The banner offers sign-in when Keycloak is reachable.                                              |
| R8  | Sign-out asks "Keep offline access on this device?" with No as the default                       | Shared-device defaults favour removal.                                                                                                        |

### Additions made while building

- **The service worker holds an unlocked session in memory.** Offline, every in-app navigation is a
  full page load, because Next cannot fetch the next route's data, and a full load empties the
  page's keyring. After unlock the page hands its non-extractable keys to the service worker, and
  the next page takes them back. The worker drops them on Lock, on any online sign-in or sign-out,
  after an idle gap longer than the idle lock, and when the browser stops it. They are never
  written to Cache Storage or IndexedDB. Another tab of the same browser can resume the session
  inside that window, as it could read the unlocked tab.
- **Chart and encounter shells are cached by exact path.** Next serves those dynamic routes
  `private, no-store` because they render per request, not because they carry anything personal:
  patient data comes from the API into the encrypted local database. The worker keeps the shell of
  `/clinics/<id>/(patients|encounters)/<id>` (and a chart's `edit` and `consent` pages) once opened
  online, within the 60-page cap. A chart never opened on the device shows `offline.html`.
  `e2e/pwa.spec.js` checks no name or national ID reaches Cache Storage.
- **Each clinic's measurement units are kept in localStorage** from the last online whoami, so an
  offline session labels a glucose value in the clinic's unit. Clinic configuration, not patient
  data.
- **Idle lock unmounts the workspace.** Saved and queued work survives. A field typed but not yet
  saved is lost, by design: keeping it on screen behind the lock would keep clinical values in the
  page.

## Scenarios

| ID    | Scenario                                                           | Expected                                                                                                                                  | Owner                                                              | Risk   | Coverage                                  |
| ----- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------ | ----------------------------------------- |
| OS-01 | A doctor who opted in cold-starts offline and unlocks with the PIN | The unlock screen shows their name only. After the PIN, their workspace opens from the grant, with the offline-session banner.            | `apps/web/app/KeycloakProvider.tsx`, `components/offline-session/` | high   | E2E                                       |
| OS-02 | A wrong PIN                                                        | "That PIN is not right" with the tries left; the field shakes, or only the text changes with reduced motion.                              | `lib/offline-session/unlock.ts`                                    | medium | Unit, E2E                                 |
| OS-03 | Five wrong PINs                                                    | The grant and wrapped key are deleted; the offline screen says why and shows the queued count, unchanged. The outbox is untouched.        | `lib/offline-session/unlock.ts`                                    | high   | Unit, E2E                                 |
| OS-04 | A page change inside an unlocked session                           | The next page opens in the same session without a second PIN.                                                                             | `lib/offline-session/hold.ts`, `lib/pwa/service-worker.js`         | high   | Unit, E2E                                 |
| OS-05 | Lock, then a page load                                             | The unlock screen, on that page and the next: the worker let go too.                                                                      | `app/KeycloakProvider.tsx`                                         | high   | Unit, E2E                                 |
| OS-06 | 10 minutes without input                                           | The session locks and the worker forgets it.                                                                                              | `components/offline-session/use-idle-lock.ts`                      | medium | Unit, Manual                              |
| OS-07 | A change saved in an offline session                               | It queues with `offlineSession: { grantId, deviceId, unlockMethod }` and is not sent.                                                     | `lib/outbox.ts`                                                    | high   | Unit, E2E                                 |
| OS-08 | The connection returns                                             | The banner offers "Sign in to send changes" only when Keycloak is reachable. After sign-in as the same person the change is applied once. | `components/offline-session/OfflineSessionBanner.tsx`              | high   | E2E                                       |
| OS-09 | A different person signs in after an offline session               | The earlier rows stay held for their owner (#162).                                                                                        | `lib/outbox.ts`                                                    | high   | E2E (outbox-owner)                        |
| OS-10 | Two people opted in on one device                                  | "Who is using this device?" lists both names; each unlocks only with their own PIN.                                                       | `components/offline-session/OfflineSessionGate.tsx`                | high   | E2E                                       |
| OS-11 | A grant past its lifetime                                          | The plain offline screen, not the unlock screen.                                                                                          | `lib/offline-session/grant.ts`                                     | medium | Unit, E2E                                 |
| OS-12 | Unlock with a passkey (PRF)                                        | Fingerprint or face unlocks; a cancelled prompt is not a wrong attempt.                                                                   | `lib/offline-session/webauthn.ts`                                  | medium | Unit, E2E (virtual authenticator)         |
| OS-13 | A system admin or a patient                                        | Never offered offline access; the API refuses a grant.                                                                                    | `lib/offline-session/bootstrap.ts`, `apps/api/src/offline-grants`  | high   | Unit, E2E                                 |
| OS-14 | A manager signs a staff member out of all offline devices          | Every grant is revoked and audited; that person's queued rows from those devices are refused at push and shown in the sync center.        | `apps/api/src/admin`, `app/(workspace)/admin/users`                | high   | Unit, Integration, Manual                 |
| OS-15 | Sign-out on an opted-in device                                     | "Keep offline access on this device?" with "No, remove it" focused. No removes the grant here and on the server.                          | `app/KeycloakProvider.tsx`                                         | medium | Manual                                    |
| OS-16 | Rows on disk while locked                                          | Ciphertext, with only primary keys and non-clinical indexes in the clear.                                                                 | `lib/offline-session/at-rest.ts`                                   | high   | Unit, real browsers, E2E (clinician-plan) |
| OS-17 | A chart opened online, then a cold start offline                   | The chart opens from the encrypted local copy. One never opened shows `offline.html`.                                                     | `lib/pwa/service-worker.js`                                        | medium | Unit, E2E                                 |

Manual steps: section 17f of `docs/USER_TESTING_GUIDE.md`.

## Operations

- `OFFLINE_DEK_ROOT_KEY` must never change on a live deployment: every device's local data,
  queued writes included, becomes unreadable.
- Turn on `NEXT_PUBLIC_FEATURE_OFFLINE_SESSION_ENABLED` only after the API keys and
  `FEATURE_OFFLINE_SESSION_ENABLED` are set.
- `NEXT_PUBLIC_OFFLINE_IDLE_LOCK_MINUTES` changes the idle lock (default 10).
