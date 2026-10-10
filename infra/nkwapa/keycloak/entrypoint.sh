#!/usr/bin/env bash
#
# Start Keycloak, then make the realm's SMTP settings match the environment.
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

kcadm() {
  "$KC_BIN/kcadm.sh" "$@" --config "$KCADM_CONFIG"
}

reconcile() {
  if [[ -z "${KC_SMTP_HOST:-}" ]]; then
    # Nothing to converge on. Overwriting a working realm with blanks would be worse than
    # leaving it alone.
    log "KC_SMTP_HOST is not set; leaving the realm's SMTP settings as they are"
    return 0
  fi

  local admin_user="${KC_BOOTSTRAP_ADMIN_USERNAME:-${KEYCLOAK_ADMIN:-}}"
  local admin_password="${KC_BOOTSTRAP_ADMIN_PASSWORD:-${KEYCLOAK_ADMIN_PASSWORD:-}}"
  if [[ -z "$admin_user" || -z "$admin_password" ]]; then
    log "WARNING: no admin credentials (KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD); SMTP settings not applied"
    return 0
  fi

  local attempt
  for ((attempt = 1; attempt <= RECONCILE_ATTEMPTS; attempt++)); do
    if kcadm config credentials --server "$RECONCILE_SERVER" --realm master \
      --user "$admin_user" --password "$admin_password" >/dev/null 2>&1; then
      break
    fi
    if ((attempt == RECONCILE_ATTEMPTS)); then
      log "WARNING: could not authenticate as admin after ${RECONCILE_ATTEMPTS} attempts; SMTP settings not applied"
      return 0
    fi
    sleep "$RECONCILE_INTERVAL_SECONDS"
  done

  if build_smtp_json | kcadm update "realms/$RECONCILE_REALM" -f - >/dev/null 2>&1; then
    # Host and transport only. The user and password stay out of the log.
    log "smtp applied to realm ${RECONCILE_REALM}: ${KC_SMTP_HOST}:${KC_SMTP_PORT:-} starttls=${KC_SMTP_STARTTLS:-false} ssl=${KC_SMTP_SSL:-false} auth=${KC_SMTP_AUTH:-false}"
  else
    log "WARNING: updating realm ${RECONCILE_REALM} failed; SMTP settings not applied"
  fi

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
