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

## 5. Check both mail paths, and that both are authenticated

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

## 6. Keycloak's SMTP settings come from the environment on every boot

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

## Rollback

Delete the client. Invitations keep working, the chart goes back to reporting that no account
stands behind them, and staff can create identities by hand as before.
