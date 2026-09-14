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

## 2. Create the client

Against the target Keycloak, as a realm administrator:

```bash
kcadm.sh config credentials --server "$KC_URL" --realm master \
  --user "$KC_BOOTSTRAP_ADMIN_USERNAME"

kcadm.sh create clients -r nkwapa \
  -s clientId=nkwapa-api \
  -s enabled=true \
  -s publicClient=false \
  -s serviceAccountsEnabled=true \
  -s standardFlowEnabled=false \
  -s implicitFlowEnabled=false \
  -s directAccessGrantsEnabled=false \
  -s fullScopeAllowed=false \
  -s 'redirectUris=[]' \
  -s 'webOrigins=[]' \
  -s secret="$KEYCLOAK_ADMIN_CLIENT_SECRET"
```

## 3. Grant exactly one role

`manage-users` on `realm-management`, and nothing else. `manage-realm`, `view-clients` or
`realm-admin` would turn a leaked secret from a contained incident into a realm takeover.

```bash
kcadm.sh add-roles -r nkwapa \
  --uusername service-account-nkwapa-api \
  --cclientid realm-management \
  --rolename manage-users
```

## 4. Put that role in the client's scope

This step is easy to miss and fails in a way that does not look like a permissions problem.
With `fullScopeAllowed=false`, Keycloak leaves any role that is not also in the client's scope
out of the issued token: the client authenticates perfectly well, and then every admin call
returns 403.

```bash
CID=$(kcadm.sh get clients -r nkwapa -q clientId=nkwapa-api --fields id --format csv --noquotes)
RM=$(kcadm.sh get clients -r nkwapa -q clientId=realm-management --fields id --format csv --noquotes)
ROLE=$(kcadm.sh get "clients/$RM/roles/manage-users" -r nkwapa --fields id,name --format json)

kcadm.sh create "clients/$CID/scope-mappings/clients/$RM" -r nkwapa -f - <<< "[$ROLE]"
```

## 5. Set the environment variables

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

## 6. Confirm the ceiling, not just the happy path

A service account that works is only half the check. Verify it cannot do more than it should:

```bash
TOKEN=$(curl -s -X POST "$KC_URL/realms/nkwapa/protocol/openid-connect/token" \
  -d grant_type=client_credentials \
  -d client_id=nkwapa-api \
  -d client_secret="$KEYCLOAK_ADMIN_CLIENT_SECRET" | jq -r .access_token)

# expected 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "$KC_URL/admin/realms/nkwapa/users?max=1"

# all expected 403
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "$KC_URL/admin/realms/nkwapa/clients"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" \
  "$KC_URL/admin/realms/nkwapa/roles"
curl -s -o /dev/null -w '%{http_code}\n' -X PUT -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"registrationAllowed":true}' \
  "$KC_URL/admin/realms/nkwapa"
```

A 403 on the first call means step 4 was missed, not step 3.

## 7. Check both mail paths

Keycloak sends the account-setup link through `KC_SMTP_*`; Nkwapa sends the invitation through
its own `SMTP_*`. They are configured independently, and the patient needs both messages: one
carries the link, the other carries the patient code. Send a real invitation to an address you
control and confirm two emails arrive before opening this to a clinic.

## Rollback

Delete the client. Invitations keep working, the chart goes back to reporting that no account
stands behind them, and staff can create identities by hand as before.
