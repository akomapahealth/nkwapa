# 29. A lost or stolen device

For clinic leads and managers. Do this the same day the device goes missing, even if it may turn
up later. Undoing it costs the staff member one sign-in.

## Why speed matters

A device someone opted in to offline access on can be unlocked without signal, with that person's
PIN or passkey, for up to **72 hours** after their last online sign-in. The PIN limits guessing on
the device itself (five wrong tries remove offline access), but someone who copies the browser's
files can keep guessing elsewhere. Revoking is what bounds the damage.

## Steps

1. **Revoke offline access.** Admin, Users, open the person, then **Sign out of offline devices**
   under "Offline access". This needs clinic management access. It withdraws offline access on
   every device they opted in on, and is audited.
2. **If the device was signed in when it was lost,** also end their online sessions and reset
   their password in Keycloak [VERIFY: the admin path in the realm console]. Step 1 does not sign
   them out online.
3. **Tell the staff member** to sign in again on their replacement device and turn offline access
   back on there (Settings, Offline access).
4. **Check the sync center** with them when they next sign in. Changes the lost device had queued
   but not sent are refused and listed there; re-enter anything still needed.
5. **Record it:** who, which device, when it went missing, when you revoked.

## What revoking does and does not do

- It stops anything queued on the lost device from being accepted: the server refuses those
  changes when the device next connects.
- It does not reach a device that stays offline. That device can still be unlocked, by whoever
  knows the PIN, until its grant runs out (72 hours from the last online sign-in). That is why
  step 1 is urgent, and why PINs should not be shared or written down.
- It does not delete the person's account or their other sessions.

## If the person is leaving the clinic

Deactivate them instead (`24_ADMIN_DEACTIVATION_AND_ACCESS_LIFECYCLE_V1.md`). Deactivation and
role removal revoke offline access as well.
