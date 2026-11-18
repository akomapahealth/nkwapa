# Key management

Every secret the production services hold: what it protects, what happens if it is lost or
changed, and how to rotate it. Values never go in this repository, an issue, a pull request or a
chat; this page names them only.

## Where secrets live

- **Render** environment of each service (API, Keycloak), and **Vercel** for the web app. That is
  the copy the services read.
- **The team password manager**, one entry per secret per environment. That is the copy you
  recover from. A secret that exists only in Render is one bad edit away from gone.
- **GitHub Actions secrets** for deploys only (see the last table).
- Staging and production never share a value.

Who can read them: whoever has access to the Render and Vercel projects and to the password
manager vault. Keep that list short, and remove people from all three when they leave.
[VERIFY: the current list, kept in the password manager itself, not here.]

## Keys that protect stored data: never change in place

Changing one of these makes data already written under it unreadable or unmatchable. None of
them can be rotated today without a migration that does not exist yet.

| Variable                     | Protects                                                                                         | If lost                                                                                                                           | If changed                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OFFLINE_DEK_ROOT_KEY`       | The data keys every device uses to encrypt its offline copy and queued changes (#207)            | Devices cannot decrypt what they hold; changes queued offline and not yet sent are lost; everyone opts in to offline access again | Same as lost                                                                                                                                                  |
| `NATIONAL_ID_ENCRYPTION_KEY` | Stored national IDs (AES-256-GCM). Also the chat master key while `CHAT_ENCRYPTION_KEY` is unset | National IDs and chat history become unreadable                                                                                   | Same as lost                                                                                                                                                  |
| `CHAT_ENCRYPTION_KEY`        | Chat messages, when set                                                                          | Chat history becomes unreadable                                                                                                   | Same. **Do not set it on an environment that already has chat history**: those messages were sealed under `NATIONAL_ID_ENCRYPTION_KEY` and would stop opening |
| `NATIONAL_ID_PEPPER`         | The national ID hashes used to find duplicates                                                   | Duplicate matching against existing patients stops working                                                                        | Same as lost. No re-hash script exists                                                                                                                        |
| `RESEARCH_HMAC_KEY`          | Research subject keys, so one patient links across export runs                                   | Later runs cannot link to earlier ones                                                                                            | Set a new `RESEARCH_HMAC_KEY_ID` with it. Runs under different key ids do not join (`docs/clinic-ops/28_READING_THE_RESEARCH_DATASET.md`)                     |

If one of these leaks, treat it as an incident: it cannot simply be replaced. Record what leaked
and when, keep the services running, and plan the migration that re-encrypts (or re-hashes) under
a new key.

## Keys with a rotation path

| Variable                                                                                           | Protects                                       | How to rotate                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OFFLINE_GRANT_SIGNING_KEY`, `OFFLINE_GRANT_KEY_ID`                                                | Signatures on offline grants                   | Move the current pair to `OFFLINE_GRANT_PREVIOUS_SIGNING_KEY` / `_KEY_ID`, set a new pair, redeploy. Remove the previous pair after `OFFLINE_GRANT_TTL_HOURS` (72 by default)                                                                 |
| `CLINICIAN_PLAN_SEAL_PRIVATE_KEY`, `CLINICIAN_PLAN_SEAL_KEY_ID`                                    | Clinician plans a doctor queues offline (#131) | Move the current pair to `CLINICIAN_PLAN_SEAL_PREVIOUS_PRIVATE_KEY` / `_KEY_ID`, set a new pair, redeploy. Remove the previous pair once no device still holds a plan sealed under it [VERIFY: how long to wait; at least the grant lifetime] |
| `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` | Background push                                | New pair in the API and the web build together. Every saved subscription stops working; people turn notifications on again in Profile                                                                                                         |
| `KEYCLOAK_ADMIN_CLIENT_SECRET`                                                                     | The API's service account in Keycloak          | Change it in Keycloak and in the API together: `docs/OPERATIONS.md`, "Keycloak service account for patient identity"                                                                                                                          |

Generation commands are in `deploy/env/production.api.env.example` next to each variable.

## Credentials: rotate at the provider

Rotate at the provider, update every place that holds it, redeploy, then confirm the service.

| Variable                                                        | Where it is held                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` (API), `KC_DB_URL` / `KC_DB_PASSWORD` (Keycloak) | Render; `DATABASE_URL` is also a GitHub Actions secret for migrations                             |
| `REDIS_URL`                                                     | Render (API)                                                                                      |
| `SMTP_PASS` (API), `KC_SMTP_PASSWORD` (Keycloak)                | Render                                                                                            |
| `TWILIO_AUTH_TOKEN`                                             | Render (API). Also what verifies Twilio's delivery callbacks                                      |
| `RESEARCH_GITHUB_TOKEN`                                         | Render (API)                                                                                      |
| `KC_BOOTSTRAP_ADMIN_PASSWORD`                                   | Render (Keycloak). Only creates the first admin; change the live admin's password in Keycloak too |
| `VERCEL_TOKEN`, `RENDER_*_DEPLOY_HOOK_URL`                      | GitHub Actions secrets (`deploy/env/github-actions.secrets.example`)                              |

`PII_ENCRYPTION_KEY_BASE64` appears in the env examples but no code reads it. Nothing depends on
its value.

## After any change

- Update the password manager entry in the same sitting.
- Check the service: `/health` for the API, a sign-in for Keycloak, a page load for the web app.
- Note the date and the variable (never the value) in the release checks or the deploy log.
