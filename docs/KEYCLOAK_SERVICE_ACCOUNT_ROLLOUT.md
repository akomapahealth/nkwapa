# Rolling out the patient identity service account

Patients are now given a Keycloak account when their portal invitation is sent, rather than
having one created for them by hand. That needs a confidential client, `nkwapa-api`, which
exists in the realm export but **will not appear in an environment that already has a realm**.

Keycloak's `--import-realm` imports a realm only when it does not already exist. Staging and
production do, so redeploying the auth service ships the new export and changes nothing. The
client has to be applied once, by hand, per environment.

Until it is, nothing breaks: invitations are still created and still emailed, and the patient
chart reports that no account stands behind them. That is the designed degradation, not a
sign the rollout worked.

## 1. Generate a secret per environment

One value, used in two places. Never commit it; `scripts/check-secrets.mjs` fails the build
if you do.

```bash
openssl rand -base64 32
```

## 2. Apply the client

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

## 3. Set the environment variables

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

## 4. Restart the API, and confirm

The API resolves this configuration once at startup, so it needs a restart to pick the values
up. Then invite a patient from a chart you control and check the chart says **Account created**
rather than **Account not created**.

If it still says the account could not be created, the reason is on the card. The usual ones
are a secret that does not match, a missing `APP_PUBLIC_URL`, or the API pointing at a
different Keycloak than the one the client was applied to.

## 5. Check both mail paths

Keycloak sends the account-setup link through `KC_SMTP_*`; Nkwapa sends the invitation through
its own `SMTP_*`. They are configured independently, and the patient needs both messages: one
carries the link, the other carries the patient code. Send a real invitation to an address you
control and confirm two emails arrive before opening this to a clinic.

## Rollback

Delete the client. Invitations keep working, the chart goes back to reporting that no account
stands behind them, and staff can create identities by hand as before.
