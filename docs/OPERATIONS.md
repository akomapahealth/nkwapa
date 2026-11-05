# Operations and deploy

How Nkwapa is hosted, how a merge becomes a deploy, how the live status gate works, and the one
manual Keycloak step each environment needs. Environment variable templates for every service are
in [`deploy/env/`](../deploy/env/); local setup is in [GETTING_STARTED.md](GETTING_STARTED.md).

## Environments

| Service                   | Production                                | Staging                         | Deployed by                       |
| ------------------------- | ----------------------------------------- | ------------------------------- | --------------------------------- |
| Web (Next.js)             | Vercel, `nkwapa.app`                      | Vercel, `staging.nkwapa.app`    | `deploy.yml`, Vercel CLI or Git   |
| API (NestJS + workers)    | Render, `api.nkwapa.app`                  | Render, `nkwapa-api-staging`    | `deploy.yml`, Render deploy hook  |
| Auth (Keycloak)           | Render, `auth.nkwapa.app` (paid instance) | Render, `nkwapa-auth-staging`   | `deploy.yml`, Render deploy hook  |
| Database                  | Neon Postgres                             | Neon Postgres                   | Prisma migrations in `deploy.yml` |
| Redis (rate limits, jobs) | Upstash                                   | Render Key Value (internal URL) | n/a                               |

Branches map to environments: a push to `release/dev` deploys staging, a push to `main` deploys
production. The production API runs on a Render free instance; `keep-warm.yml` pings it during
Ghana clinic hours (Monday to Saturday) so the first sign-in of the day does not wait for a cold
boot. The workflow file explains the free-hours budget behind that schedule.

## How a deploy runs

`.github/workflows/deploy.yml`, on every push to `main` or `release/dev`:

1. **Migrate.** `npm run db:migrate:deploy` against that environment's `DATABASE_URL`. Prisma runs
   each migration on its own, not as one transaction, so a failed deploy can leave earlier DDL
   committed.
2. **Deploy web, API and auth** in parallel once migrations pass.
3. **Verify** the live deployment (`npm run deploy:verify`, below).
4. **Tag the release** (production only), after verification passes. A pull request into `main`
   needs exactly one `release:major`, `release:minor` or `release:patch` label
   (`release-label.yml`); the tag job reads it to pick the next version.

**Rollback** is a revert on the branch, which redeploys. Migrations are forward-only: a revert does
not undo a schema change, so a release that changes the schema needs its own rollback note.

## Live status and post-deploy gate

The landing footer reads `GET /status` once on load, again when its status dialog opens, and on
Refresh, never on a timer: each check runs a database query, and a tab polling every minute kept the free API and Neon
awake around the clock (#172). It gives up after 10 seconds and shows "API unreachable". The API
coalesces concurrent checks and caches one result for 30 seconds. It reports database, Redis,
background queues, email, Keycloak discovery, and the web version endpoint. The public body contains
fixed component names, states, latency, check time, safe reason codes, and the API/web commit SHAs.
The footer does not display SHAs. `GET /status/details` returns dependency errors and queue names
only to a signed-in global System Admin.

An outage means database or auth failed. A noncritical failure, slow check, queue job waiting more
than five minutes (`STALE_JOBS`), a job that failed in the last five minutes (`RECENT_FAILURES`; older
failures are kept by BullMQ and ignored), failed latest email send, the fake email provider under
`NODE_ENV=production` (`FAKE_PROVIDER`), or web/API commit mismatch means degraded. Email with no
send since process start reports `NO_RESULT` and remains operational. Status is a current snapshot,
not an uptime history.

### Deployment configuration

Set these **GitHub Environment variables** separately in `production` and `staging`:

| Variable             | Production example                      | Staging example               |
| -------------------- | --------------------------------------- | ----------------------------- |
| `VERIFY_WEB_URL`     | `https://nkwapa.app`                    | `https://staging.nkwapa.app`  |
| `VERIFY_API_URL`     | `https://api.nkwapa.app`                | The staging Render API origin |
| `VERIFY_AUTH_ISSUER` | `https://auth.nkwapa.app/realms/nkwapa` | The staging Keycloak issuer   |

The API's first `CORS_ALLOWED_ORIGINS` entry must be the corresponding web origin. Render must expose
the deployed commit in `RENDER_GIT_COMMIT` (or set `GITHUB_SHA` on the service to that commit). Vercel
must expose `VERCEL_GIT_COMMIT_SHA` (or `GITHUB_SHA` at build time). The web route `/api/version` and
the API status response must both contain the pushed GitHub SHA. A missing SHA fails verification.

Set the `production` GitHub Environment **secret** `VERIFY_READONLY_DATABASE_URL` to a dedicated
Postgres login. The verifier rejects elevated roles or write privileges on any public table,
opens a read-only transaction, and counts only fixture markers shared with
`packages/db/src/seed-plan.ts`. Fixture users count only while active, because
`npm run db:purge-seed-fixtures -- --apply` deactivates them rather than deleting them. Create the login with a unique password and grant the minimum
table access, using an administrative database connection:

```sql
CREATE ROLE nkwapa_deploy_verify LOGIN PASSWORD '<unique generated password>';
GRANT CONNECT ON DATABASE your_database TO nkwapa_deploy_verify;
GRANT USAGE ON SCHEMA public, app TO nkwapa_deploy_verify;
GRANT SELECT ON TABLE "User", "Patient" TO nkwapa_deploy_verify;
```

Use a connection string for this role as the secret. The verifier sets the existing system-admin
RLS context locally within its read-only transaction so it can see all clinic fixture markers.
Keep the credential only in the GitHub production Environment, not in Render or Vercel. Check that
the two SELECT counts are visible across clinics when provisioning the role. If the role lacks
access, the gate fails rather than treating hidden fixtures as absent.

`verify-deploy` runs after the web, API, and auth deploy jobs. It retries for at most ten minutes
while Render and Vercel converge, then writes all failures to the GitHub job summary. A release tag
is created only after this job passes. The verifier requires all six components operational, both
SHAs equal to `GITHUB_SHA`, a matching OIDC issuer, a successful web response, and an allowed CORS
preflight. Missing targets or the production fixture credential fail the gate.

## Keycloak service account for patient identity

Patients are now given a Keycloak account when their portal invitation is sent, rather than
having one created for them by hand. That needs a confidential client, `nkwapa-api`, which
exists in the realm export but **will not appear in an environment that already has a realm**.

Keycloak's `--import-realm` imports a realm only when it does not already exist. Staging and
production do, so redeploying the auth service ships the new export and changes nothing. The
client has to be applied once, by hand, per environment.

Until it is, nothing breaks: invitations are still created and still emailed, and the patient
chart reports that no account stands behind them. That is the designed degradation, not a
sign the rollout worked.

### 1. Generate a secret per environment

One value, used in two places. Never commit it; `scripts/check-secrets.mjs` fails the build
if you do.

```bash
openssl rand -base64 32
```

### 2. Apply the client

One command, idempotent, and it verifies itself. Run it from a machine that can reach the
target Keycloak, with the credentials for that environment:

```bash
KEYCLOAK_BASE_URL=https://auth.nkwapa.app \
KC_BOOTSTRAP_ADMIN_USERNAME=<realm admin> \
KC_BOOTSTRAP_ADMIN_PASSWORD=<realm admin password> \
KEYCLOAK_ADMIN_CLIENT_SECRET=<the value from step 1> \
npm run keycloak:apply-service-account
```

Add `-- --dry-run` first if you want to see what it would change without writing anything.

It does four things, checking before each so a re-run is a no-op and a partial run can simply
be repeated:

1. **Creates the confidential `nkwapa-api` client.** No standard flow, no implicit flow, no
   direct access grants, no redirect URIs. It exists only to be used server-side.
2. **Grants `manage-users` on `realm-management`**, and warns if the service account holds any
   other role. That is the whole ceiling: `manage-realm` or `realm-admin` would turn a leaked
   secret from a contained incident into a realm takeover.
3. **Adds the scope mapping.** This is the step that is easy to miss and hard to read. With
   `fullScopeAllowed: false`, Keycloak leaves any role that is not also in the client's _scope_
   out of the issued token: the client authenticates perfectly well, and then every admin call
   returns 403. It looks like a missing role and is not.
4. **Proves the ceiling rather than the happy path**, by taking a service-account token and
   checking that reading users returns 200 while listing clients, listing realm roles and
   updating the realm all return 403.

If the verification reports `read users: 403`, that is step 3 rather than step 2. Re-run the
script.

The script also warns if `registrationAllowed` has been turned on. It must stay off: open
self-registration would let anyone create an account against a clinic.

### 3. Set the environment variables

On the API service (see `deploy/env/*.api.env.example`):

```
KEYCLOAK_ADMIN_BASE_URL=<the same Keycloak the API already validates tokens against>
KEYCLOAK_REALM=nkwapa
KEYCLOAK_ADMIN_CLIENT_ID=nkwapa-api
KEYCLOAK_ADMIN_CLIENT_SECRET=<the value from step 1>
```

On the Keycloak service, so a future clean import substitutes the same secret rather than the
literal placeholder (see `deploy/env/*.keycloak.env.example`):

```
KEYCLOAK_ADMIN_CLIENT_SECRET=<the same value>
```

`APP_PUBLIC_URL` must also be set on the API. Without it there is no honest address to send
the patient back to, and provisioning is skipped rather than guessed at.

### 4. Restart the API, and confirm

The API resolves this configuration once at startup, so it needs a restart to pick the values
up. Then invite a patient from a chart you control and check the chart says **Account created**
rather than **Account not created**.

If it still says the account could not be created, the reason is on the card. The usual ones
are a secret that does not match, a missing `APP_PUBLIC_URL`, or the API pointing at a
different Keycloak than the one the client was applied to.

### 5. Check both mail paths, and that both are authenticated

Keycloak sends the account-setup link through `KC_SMTP_*`; Nkwapa sends the invitation through
its own `SMTP_*`. They are configured independently, and the patient needs both messages: one
carries the link, the other carries the patient code.

**The link is the half that fails quietly.** It is sent by Keycloak, so if the two services send
from different domains and only one of them is authenticated, the patient receives the friendly
context email and never sees the link. That is indistinguishable, from the clinic's side, from
the invite being broken.

Four things have to line up:

1. **Same sender domain on both services.** `KC_SMTP_FROM` and `EMAIL_FROM` must match, or the
   cross-reference that stops the pair reading as a phishing attempt has nothing to rest on.
2. **Leave the envelope sender alone.** SPF is evaluated against the envelope sender rather than
   the header From, and a transactional provider sets an envelope on a subdomain it controls and
   has already published SPF for. Setting `KC_SMTP_ENVELOPE_FROM` to the bare domain overrides
   that and hands SPF a record which does not list the provider, turning a pass into a softfail.
   DKIM still carries DMARC, so nothing visibly breaks and the alignment is gone. Set it only if
   you have a specific reason and have checked the record you are pointing it at.
3. **Both services must authenticate against a domain the relay can actually send for.** If they
   use different relays, or the same provider under two accounts, only the account that has
   verified the sending domain can send as it: point both at that account's credentials. Adding
   the second relay to the bare domain's SPF record is not the fix, because with a provider that
   manages its own return-path, that record is not the one being checked.
4. **Same display name on both services, per environment.** `EMAIL_FROM_NAME` on the API and
   `KC_SMTP_FROM_DISPLAY_NAME` on Keycloak. The domain check above is what machines verify; this
   is what the patient verifies. The display name is the most prominent thing in an inbox list,
   more so than the address, which most clients hide entirely — so an invite from one name
   followed by a setup link from another defeats the pairing even when SPF and DKIM both pass.
   Staging uses its own name on both services rather than borrowing production's.

Send a real invitation to an external address you control, not an internal one, and confirm two
emails arrive. Then open the setup email's raw source (in Gmail, "Show original") and check that
SPF, DKIM and DMARC all report `PASS`. Two emails arriving is necessary and not sufficient;
authentication is what decides whether they keep arriving once volume picks up.

### 6. Keycloak's SMTP settings come from the environment on every boot

The realm export substitutes `KC_SMTP_*` into the realm's `smtpServer`, but, like the client
above, only on the first import. Before this was handled, changing `KC_SMTP_PORT` on the
Keycloak service and redeploying left the live realm on its original relay and port. In
practice the API invitation arrived and the account-setup link never did, because Keycloak was
still dialling a port Render drops.

The image now starts through `infra/nkwapa/keycloak/entrypoint.sh`. Once Keycloak is up, it
signs in with `KC_BOOTSTRAP_ADMIN_USERNAME`/`KC_BOOTSTRAP_ADMIN_PASSWORD` and writes every
`KC_SMTP_*` value into the realm. Check for this line in the Keycloak logs after each deploy:

```
[nkwapa-reconcile] smtp applied to realm nkwapa: smtp.resend.com:2587 starttls=true ssl=false auth=true
```

It never logs the relay username or password. The reconcile is written so it can't stop
Keycloak from starting: if it can't authenticate or the update is refused, it logs a
`WARNING` and sign-in carries on. The usual causes are bootstrap admin credentials that were
changed after first boot, or `KC_SMTP_HOST` being unset. An unset host is deliberate: the
reconcile then leaves the realm alone instead of blanking it.

The same pass warns if the `nkwapa-api` client is missing from the realm. That is the other
way the setup link never goes out, and it's fixed by step 2 above.

### Rollback

Delete the client. Invitations keep working, the chart goes back to reporting that no account
stands behind them, and staff can create identities by hand as before.
