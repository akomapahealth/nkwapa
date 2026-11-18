#!/usr/bin/env bash
#
# Start Keycloak, then make the realm's SMTP settings and token audience match what the API expects.
#
# The realm export substitutes KC_SMTP_* into smtpServer, but only when the realm is first
# imported: --import-realm skips a realm that already exists. So once staging or production
# has a realm, editing KC_SMTP_PORT on the service changes nothing, and Keycloak keeps sending
# through whatever relay and port it was first given. That is how the account-setup email kept
# failing after the API had already been moved off the port Render blocks.
#
# Applying the values on every boot makes the service environment the source of truth, the same
# way it already is for the API. It is deliberately forgiving: a failure here is logged and
# Keycloak keeps running, because a login server that refuses to start over mail settings takes
# down sign-in for every clinic to protect one email.
#
# The same boot step hardens the realm (see each reconcile_* below): nkwapa-web's grant, PKCE and
# origins, stored events, and a required second factor for admins.
#
# It also adds the nkwapa-api audience mapper to nkwapa-web when a live realm lacks it.
# The API checks that audience once KEYCLOAK_AUDIENCE is set, so a realm without the mapper would
# reject every session; adding it on boot keeps an older realm from drifting there.

set -uo pipefail

KC_BIN="${KC_BIN:-/opt/keycloak/bin}"
RECONCILE_REALM="${KC_RECONCILE_REALM:-nkwapa}"
RECONCILE_SERVER="${KC_RECONCILE_SERVER:-http://localhost:8080}"
RECONCILE_ATTEMPTS="${KC_RECONCILE_ATTEMPTS:-60}"
RECONCILE_INTERVAL_SECONDS="${KC_RECONCILE_INTERVAL_SECONDS:-3}"
# Kept outside the Keycloak home so the admin token never lands beside the server's own state.
KCADM_CONFIG="${KCADM_CONFIG:-/tmp/nkwapa-kcadm.config}"

log() {
  printf '[nkwapa-reconcile] %s\n' "$*" >&2
}

# A JSON string literal. Covers everything an env var can plausibly carry: quotes and
# backslashes in a relay password, and stray control characters from a pasted value.
json_escape() {
  local value=$1
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '"%s"' "$value"
}

# Every value is a string: smtpServer is a Map<String, String> in the realm representation, and
# a bare number or boolean is exactly the sort of thing a future Keycloak may stop coercing.
build_smtp_json() {
  local timeout="${KC_SMTP_TIMEOUT_MS:-10000}"
  local -a pairs=(
    host "${KC_SMTP_HOST:-}"
    port "${KC_SMTP_PORT:-}"
    from "${KC_SMTP_FROM:-}"
    fromDisplayName "${KC_SMTP_FROM_DISPLAY_NAME:-}"
    replyTo "${KC_SMTP_REPLY_TO:-}"
    replyToDisplayName "${KC_SMTP_REPLY_TO_DISPLAY_NAME:-}"
    envelopeFrom "${KC_SMTP_ENVELOPE_FROM:-}"
    auth "${KC_SMTP_AUTH:-false}"
    starttls "${KC_SMTP_STARTTLS:-false}"
    ssl "${KC_SMTP_SSL:-false}"
    user "${KC_SMTP_USER:-}"
    password "${KC_SMTP_PASSWORD:-}"
    # Bounded so a blocked port fails in seconds, inside the API's budget for the send call,
    # rather than hanging until something upstream gives up first and reports the wrong cause.
    connectionTimeout "$timeout"
    timeout "$timeout"
    writeTimeout "$timeout"
  )
  local out='{"smtpServer":{'
  local i
  for ((i = 0; i < ${#pairs[@]}; i += 2)); do
    ((i > 0)) && out+=','
    out+="$(json_escape "${pairs[i]}"):$(json_escape "${pairs[i + 1]}")"
  done
  out+='}}'
  printf '%s' "$out"
}

# Must match the mapper on nkwapa-web in the realm export; scripts/validate-keycloak-realm.mjs
# compares the two. A custom audience, not a client reference, so it works in a realm that does
# not have the nkwapa-api client yet.
AUDIENCE_MAPPER_NAME='nkwapa-api audience'
audience_mapper_json() {
  printf '%s' '{"name":"nkwapa-api audience","protocol":"openid-connect","protocolMapper":"oidc-audience-mapper","consentRequired":false,"config":{"included.custom.audience":"nkwapa-api","id.token.claim":"false","access.token.claim":"true","introspection.token.claim":"true"}}'
}

kcadm() {
  "$KC_BIN/kcadm.sh" "$@" --config "$KCADM_CONFIG"
}

reconcile_smtp() {
  if [[ -z "${KC_SMTP_HOST:-}" ]]; then
    # Nothing to converge on. Overwriting a working realm with blanks would be worse than
    # leaving it alone.
    log "KC_SMTP_HOST is not set; leaving the realm's SMTP settings as they are"
    return 0
  fi

  if build_smtp_json | kcadm update "realms/$RECONCILE_REALM" -f - >/dev/null 2>&1; then
    # Host and transport only. The user and password stay out of the log.
    log "smtp applied to realm ${RECONCILE_REALM}: ${KC_SMTP_HOST}:${KC_SMTP_PORT:-} starttls=${KC_SMTP_STARTTLS:-false} ssl=${KC_SMTP_SSL:-false} auth=${KC_SMTP_AUTH:-false}"
  else
    log "WARNING: updating realm ${RECONCILE_REALM} failed; SMTP settings not applied"
  fi
}

# Add only, never update or delete: a mapper someone edited by hand is left for a person to look at.
reconcile_audience_mapper() {
  local web_id
  web_id=$(kcadm get clients -r "$RECONCILE_REALM" -q clientId=nkwapa-web --fields id --format csv --noquotes 2>/dev/null)
  if [[ -z "$web_id" ]]; then
    log "WARNING: client nkwapa-web not found in realm ${RECONCILE_REALM}; audience mapper not checked"
    return 0
  fi

  if kcadm get "clients/$web_id/protocol-mappers/models" -r "$RECONCILE_REALM" --fields name --format csv --noquotes 2>/dev/null |
    grep -qxF "$AUDIENCE_MAPPER_NAME"; then
    return 0
  fi

  if audience_mapper_json | kcadm create "clients/$web_id/protocol-mappers/models" -r "$RECONCILE_REALM" -f - >/dev/null 2>&1; then
    log "added the '${AUDIENCE_MAPPER_NAME}' mapper to nkwapa-web in realm ${RECONCILE_REALM}"
  else
    log "WARNING: adding the '${AUDIENCE_MAPPER_NAME}' mapper to nkwapa-web failed; tokens will not carry aud nkwapa-api"
  fi
}

web_client_id() {
  kcadm get clients -r "$RECONCILE_REALM" -q clientId=nkwapa-web --fields id --format csv --noquotes 2>/dev/null
}

# nkwapa-web settings that must hold in every environment: no password grant (it skips the browser
# flow, so its second factor) and PKCE required. With KC_WEB_ORIGINS set (comma-separated, say
# "https://nkwapa.app"), its redirect URIs, web origins and logout URIs become exactly those, so
# production stops accepting staging and localhost. Unset, the URIs are left as they are.
web_client_json() {
  local out='{"directAccessGrantsEnabled":false,"attributes":{"pkce.code.challenge.method":"S256"'
  if [[ -n "${KC_WEB_ORIGINS:-}" ]]; then
    local -a origins redirects=()
    local origin web_list='' logout=''
    IFS=',' read -ra origins <<<"$KC_WEB_ORIGINS"
    for origin in "${origins[@]}"; do
      origin=$(printf '%s' "$origin" | tr -d '[:space:]')
      origin=${origin%/}
      [[ -z "$origin" ]] && continue
      redirects+=("$origin" "$origin/*")
      web_list+="${web_list:+,}$(json_escape "$origin")"
    done
    local redirect_list='' uri
    for uri in "${redirects[@]}"; do
      redirect_list+="${redirect_list:+,}$(json_escape "$uri")"
      logout+="${logout:+##}$uri"
    done
    out+=",\"post.logout.redirect.uris\":$(json_escape "$logout")},\"redirectUris\":[${redirect_list}],\"webOrigins\":[${web_list}]}"
  else
    out+='}}'
  fi
  printf '%s' "$out"
}

reconcile_web_client() {
  local web_id
  web_id=$(web_client_id)
  if [[ -z "$web_id" ]]; then
    log "WARNING: client nkwapa-web not found in realm ${RECONCILE_REALM}; client settings not applied"
    return 0
  fi
  if web_client_json | kcadm update "clients/$web_id" -r "$RECONCILE_REALM" -f - >/dev/null 2>&1; then
    log "nkwapa-web: password grant off, PKCE S256${KC_WEB_ORIGINS:+, origins ${KC_WEB_ORIGINS}}"
  else
    log "WARNING: updating nkwapa-web failed; password grant, PKCE and origins not applied"
  fi
}

# Login and admin events, kept 30 days. Admin event details stay off: they hold the full
# representation of whatever changed, a user's profile included.
EVENTS_EXPIRATION_SECONDS=2592000
events_json() {
  printf '{"eventsEnabled":true,"eventsExpiration":%s,"adminEventsEnabled":true,"adminEventsDetailsEnabled":false}' "$EVENTS_EXPIRATION_SECONDS"
}

reconcile_events() {
  if events_json | kcadm update "events/config" -r "$RECONCILE_REALM" -f - >/dev/null 2>&1 &&
    kcadm update "realms/$RECONCILE_REALM" -r "$RECONCILE_REALM" -s "attributes.adminEventsExpiration=$EVENTS_EXPIRATION_SECONDS" >/dev/null 2>&1; then
    log "events: login and admin events stored for ${EVENTS_EXPIRATION_SECONDS}s"
  else
    log "WARNING: enabling events in realm ${RECONCILE_REALM} failed"
  fi
}

# A second factor can only be set up through these required actions.
reconcile_required_actions() {
  local registered action name
  registered=$(kcadm get authentication/required-actions -r "$RECONCILE_REALM" --fields alias --format csv --noquotes 2>/dev/null)
  for action in CONFIGURE_TOTP webauthn-register; do
    if ! grep -qxF "$action" <<<"$registered"; then
      name=$([[ $action == CONFIGURE_TOTP ]] && echo 'Configure OTP' || echo 'Webauthn Register')
      kcadm create authentication/register-required-action -r "$RECONCILE_REALM" \
        -s "providerId=$action" -s "name=$name" >/dev/null 2>&1 ||
        log "WARNING: registering required action ${action} failed"
    fi
    kcadm update "authentication/required-actions/$action" -r "$RECONCILE_REALM" -s enabled=true >/dev/null 2>&1 ||
      log "WARNING: enabling required action ${action} failed"
  done
}

# The browser flow, plus a required second factor (authenticator app or passkey) for anyone holding
# Keycloak's SYSTEM_ADMIN realm role. App roles live in the API's database, so that Keycloak role is
# assigned by hand (docs/OPERATIONS.md). Everyone else keeps the built-in opt-in step, which skips
# admins so they are not asked twice. Must match the flow in the realm export
# (scripts/validate-keycloak-realm.mjs checks its shape). Add only: an existing flow of this name is
# left alone, and a realm bound to some other browser flow keeps it.
ADMIN_MFA_FLOW='browser with admin second factor'
ADMIN_MFA_ROLE='SYSTEM_ADMIN'

# The Keycloak image has no awk. Reads "id,b[,c]" lines; prints the first id whose b is $1 (and c
# is $2, when given).
first_id_where() {
  local id b c
  while IFS=, read -r id b c; do
    if [[ "$b" == "$1" && (-z "${2:-}" || "$c" == "$2") ]]; then
      printf '%s' "$id"
      return 0
    fi
  done
  return 1
}

# kcadm does not encode paths, and flow aliases have spaces.
flow_path() {
  printf 'authentication/flows/%s' "${1// /%20}"
}

flow_execution_id() { # flow alias, providerId
  kcadm get "$(flow_path "$1")/executions" -r "$RECONCILE_REALM" --fields id,providerId --format csv --noquotes 2>/dev/null |
    first_id_where "$2"
}

# A new execution gets priority 0 and so runs first. Every one added here gets an explicit
# priority: a role condition placed before the username form sees no user and never matches.
set_requirement() { # flow alias, execution id, requirement, priority
  [[ -n "$2" ]] || return 1
  kcadm update "$(flow_path "$1")/executions" -r "$RECONCILE_REALM" \
    -b "{\"id\":\"$2\",\"requirement\":\"$3\",\"priority\":$4}" >/dev/null 2>&1
}

add_execution() { # flow alias, providerId, requirement, priority -> prints the execution id
  kcadm create "$(flow_path "$1")/executions/execution" -r "$RECONCILE_REALM" -s "provider=$2" >/dev/null 2>&1 || return 1
  local id
  id=$(kcadm get "$(flow_path "$1")/executions" -r "$RECONCILE_REALM" --fields id,providerId,level --format csv --noquotes 2>/dev/null |
    first_id_where "$2" 0)
  set_requirement "$1" "$id" "$3" "$4" && printf '%s' "$id"
}

add_role_condition() { # flow alias, negate, priority
  local id
  id=$(add_execution "$1" conditional-user-role REQUIRED "$3") || return 1
  kcadm create "authentication/executions/$id/config" -r "$RECONCILE_REALM" \
    -s "alias=$1 role" -s "config.condUserRole=$ADMIN_MFA_ROLE" -s "config.negate=$2" >/dev/null 2>&1
}

add_subflow() { # parent flow alias, subflow alias, requirement, priority
  kcadm create "$(flow_path "$1")/executions/flow" -r "$RECONCILE_REALM" \
    -s "alias=$2" -s type=basic-flow -s provider=basic-flow >/dev/null 2>&1 || return 1
  local id
  id=$(kcadm get "$(flow_path "$1")/executions" -r "$RECONCILE_REALM" --fields id,displayName --format csv --noquotes 2>/dev/null |
    first_id_where "$2")
  set_requirement "$1" "$id" "$3" "$4"
}

# Keycloak fails the whole sign-in when none of a flow's ALTERNATIVE factors is set up, before any
# required action runs, so the admin step is two conditional steps instead: a passkey when the
# admin has one, otherwise the authenticator app. A REQUIRED app step with nothing set up sends
# the admin to the authenticator setup page, which is how a new admin enrols.
build_admin_mfa_flow() {
  local forms="$ADMIN_MFA_FLOW forms"
  local optional="$ADMIN_MFA_FLOW Browser - Conditional 2FA"
  local admin="$ADMIN_MFA_FLOW admin second factor"
  local passkey="$ADMIN_MFA_FLOW admin passkey"
  local app="$ADMIN_MFA_FLOW admin authenticator app"
  kcadm create authentication/flows/browser/copy -r "$RECONCILE_REALM" -s "newName=$ADMIN_MFA_FLOW" >/dev/null 2>&1 || return 1

  # The opt-in step: skip admins, and accept a passkey as well as an authenticator app.
  # Built-in priorities there: user configured 10, credential 20, OTP 30, recovery codes 50.
  add_role_condition "$optional" true 5 || return 1
  set_requirement "$optional" "$(flow_execution_id "$optional" webauthn-authenticator)" ALTERNATIVE 40 || return 1

  # After the username form (10) and the opt-in step (20), so the user is known.
  add_subflow "$forms" "$admin" CONDITIONAL 30 || return 1
  add_role_condition "$admin" false 10 || return 1

  add_subflow "$admin" "$passkey" CONDITIONAL 20 || return 1
  add_execution "$passkey" conditional-user-configured REQUIRED 10 >/dev/null || return 1
  add_execution "$passkey" webauthn-authenticator REQUIRED 20 >/dev/null || return 1

  add_subflow "$admin" "$app" CONDITIONAL 30 || return 1
  local no_passkey
  no_passkey=$(add_execution "$app" conditional-credential REQUIRED 10) || return 1
  kcadm create "authentication/executions/$no_passkey/config" -r "$RECONCILE_REALM" \
    -s "alias=$app no passkey" -s config.credentials=webauthn -s config.included=false >/dev/null 2>&1 || return 1
  add_execution "$app" auth-otp-form REQUIRED 20 >/dev/null || return 1
}

reconcile_admin_mfa_flow() {
  local flows
  flows=$(kcadm get authentication/flows -r "$RECONCILE_REALM" --fields alias --format csv --noquotes 2>/dev/null)
  if ! grep -qxF "$ADMIN_MFA_FLOW" <<<"$flows"; then
    if build_admin_mfa_flow; then
      log "created the '${ADMIN_MFA_FLOW}' flow in realm ${RECONCILE_REALM}"
    else
      # Never leave a half-built flow under this name: the next boot would bind it.
      local partial
      partial=$(kcadm get authentication/flows -r "$RECONCILE_REALM" --fields id,alias --format csv --noquotes 2>/dev/null |
        first_id_where "$ADMIN_MFA_FLOW")
      [[ -n "$partial" ]] && kcadm delete "authentication/flows/$partial" -r "$RECONCILE_REALM" >/dev/null 2>&1
      log "WARNING: building the '${ADMIN_MFA_FLOW}' flow failed; admins sign in without a second factor until the next boot retries"
      return 0
    fi
  fi

  local bound
  bound=$(kcadm get "realms/$RECONCILE_REALM" --fields browserFlow --format csv --noquotes 2>/dev/null)
  if [[ "$bound" == 'browser' ]]; then
    if kcadm update "realms/$RECONCILE_REALM" -s "browserFlow=$ADMIN_MFA_FLOW" >/dev/null 2>&1; then
      log "bound '${ADMIN_MFA_FLOW}' as the browser flow; ${ADMIN_MFA_ROLE} now needs a second factor"
    else
      log "WARNING: binding '${ADMIN_MFA_FLOW}' failed; admins sign in without a second factor"
    fi
  elif [[ "$bound" != "$ADMIN_MFA_FLOW" ]]; then
    log "WARNING: realm ${RECONCILE_REALM} uses browser flow '${bound}'; '${ADMIN_MFA_FLOW}' was not bound"
  fi
}

reconcile() {
  local admin_user="${KC_BOOTSTRAP_ADMIN_USERNAME:-${KEYCLOAK_ADMIN:-}}"
  local admin_password="${KC_BOOTSTRAP_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-}}"
  if [[ -z "$admin_user" || -z "$admin_password" ]]; then
    log "WARNING: no admin credentials (KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD); realm not reconciled"
    return 0
  fi

  local attempt
  for ((attempt = 1; attempt <= RECONCILE_ATTEMPTS; attempt++)); do
    if kcadm config credentials --server "$RECONCILE_SERVER" --realm master \
      --user "$admin_user" --password "$admin_password" >/dev/null 2>&1; then
      break
    fi
    if ((attempt == RECONCILE_ATTEMPTS)); then
      log "WARNING: could not authenticate as admin after ${RECONCILE_ATTEMPTS} attempts; realm not reconciled"
      return 0
    fi
    sleep "$RECONCILE_INTERVAL_SECONDS"
  done

  reconcile_smtp
  reconcile_audience_mapper
  reconcile_web_client
  reconcile_events
  reconcile_required_actions
  reconcile_admin_mfa_flow

  # The other way the account-setup email never goes out: the API has no client to ask with.
  local client
  client=$(kcadm get clients -r "$RECONCILE_REALM" -q clientId=nkwapa-api --fields id 2>/dev/null)
  if [[ "$client" != *'"id"'* ]]; then
    log "WARNING: client nkwapa-api is missing from realm ${RECONCILE_REALM}; patient account setup is disabled until 'npm run keycloak:apply-service-account' is run"
  fi

  rm -f "$KCADM_CONFIG"
}

main() {
  "$KC_BIN/kc.sh" "$@" &
  local kc_pid=$!
  # Keycloak is a child now, so the platform's stop signal has to be handed on explicitly.
  trap 'kill -TERM "$kc_pid" 2>/dev/null' TERM INT

  reconcile &
  local reconcile_pid=$!

  local status
  wait "$kc_pid"
  status=$?
  # A trapped signal interrupts wait before Keycloak has finished shutting down.
  if kill -0 "$kc_pid" 2>/dev/null; then
    wait "$kc_pid"
    status=$?
  fi
  kill "$reconcile_pid" 2>/dev/null
  exit "$status"
}

# Sourcing the file exposes the helpers to scripts/validate-keycloak-realm.mjs without starting
# a server.
# `return` only succeeds inside a sourced file, which is the one check that holds however the
# caller spells the path.
if ! (return 0 2>/dev/null); then
  main "$@"
fi
