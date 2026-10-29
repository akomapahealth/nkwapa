# Live status and post-deploy gate

The landing footer reads `GET /status` once on load and again when its panel opens, never on a
timer: each check runs a database query, and a tab polling every minute kept the free API and Neon
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

## Deployment configuration

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
