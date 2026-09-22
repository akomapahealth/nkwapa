⸻

/docs/specs/NOTIFICATIONS_SMS_EMAIL_V1.md

Goal

Deliver every outbound message the clinic sends — reminders, portal invites, appointment
updates, and staff access notices — through one recorded, retryable path.

Provider abstraction

Backend defines two interfaces:
• SmsProvider.send(to, body)
• EmailProvider.send(to, subject, html, text?)

Implementations:
• FakeSmsProvider / FakeEmailProvider (dev and CI) log message sizes, never content or
recipient, because both are PHI
• TwilioSmsProvider (behind SMS_PROVIDER=twilio)
• NodemailerEmailProvider (behind EMAIL_PROVIDER=nodemailer)
• UnconfiguredEmailProvider stands in when SMTP was asked for but not supplied

Provider selection lives in the global NotificationModule and never throws. A missing
SMTP variable is an operational problem for one feature, not a reason to fail startup for
every route.

The SMTP port is a deployment constraint, not a preference. Render blocks outbound traffic
to ports 25, 465 and 587 on free web services, and to 25 on every tier, by dropping packets
rather than refusing them — so a service pointed at 587 hangs until it times out instead of
failing. Both the API and Keycloak run on Render and both use Resend's alternate ports: 2587
for STARTTLS, 2465 for implicit TLS. `resolveSecure` treats 465 and 2465 as implicit TLS for
that reason. Transport timeouts are set explicitly (10s connect, 10s greeting, 30s socket)
because nodemailer's two-minute default would stall the single-concurrency reminder queue
behind one unreachable relay.

Templates

Templates are TypeScript modules behind a registry, not HTML assets. They were previously
read from disk at runtime and were never copied into the build output, so every production
email silently degraded to a one-line stub inside a catch. Compiled modules cannot go
missing.

Each template renders a subject, an HTML body, and a plain-text alternative; the two
reminder templates also render an SMS body. All interpolated values are escaped, and times
are rendered in the clinic's timezone rather than the server's.

Current keys: FOLLOWUP_REMINDER_V1, APPOINTMENT_REMINDER_V1, PORTAL_INVITE_V1,
APPOINTMENT_CONFIRMED_V1, APPOINTMENT_RESCHEDULED_V1, APPOINTMENT_CANCELLED_V1,
STAFF_ROLE_GRANTED_V1, STAFF_ROLE_REVOKED_V1, STAFF_ACCOUNT_DEACTIVATED_V1.

Delivery ledger

Every message is a row in Reminder, which records channel, recipient, template, status,
provider message id, and failure reason. Scheduled reminders carry a future scheduledAt;
everything else is queued immediately with a zero delay, so all of it shares one queue,
one retry policy, one audit trail, and one operator view.

clinicId and patientId are both nullable: a staff notice has no patient, and a global
account deactivation belongs to no clinic. A check constraint keeps a row from naming both
a patient and a user, which is what stops a staff notice from ever appearing in a
patient's own portal feed.

Scheduling

When a doctor finalizes an encounter with follow_up_date:
• create a Reminder record with scheduled_at
• enqueue a delayed job in BullMQ

Appointment reminders fire 24 hours before the appointment and are re-validated at send
time, so cancelled, completed, no-show, or stale rescheduled reminders are never
delivered.

Endpoints
• GET /clinics/:clinicId/reminders (status, channel, type, date filters)
• GET /clinics/:clinicId/reminders/email-status
• POST /clinics/:clinicId/patients/:patientId/portal-invite/:inviteId/resend
• POST /webhooks/sms/status (Twilio delivery receipts)

Delivery status

SMS reaches DELIVERED through a provider callback. SMTP has no equivalent, so an accepted
email terminates at SENT. This is stated in the UI rather than papered over, and no
DELIVERED status is ever fabricated for email.

Failure vocabulary: NO_CONTACT_METHOD, SEND_FAILED, EMAIL_SEND_FAILED,
EMAIL_NOT_CONFIGURED, EMAIL_CHANNEL_UNAVAILABLE, QUEUE_UNAVAILABLE,
TEMPLATE_NOT_FOUND:<key>, DELIVERY_FAILED:<code>, APPOINTMENT_NOT_FOUND,
APPOINTMENT_NOT_CONFIRMED:<status>, APPOINTMENT_RESCHEDULED.

Delivery rate and retries

The worker runs five jobs at a time, capped at five per second. The default concurrency of 1 made
every notification wait on the SMTP round trip of the one in front of it, so a clinic session's
worth of invites delivered strictly serially. The cap is what makes raising it safe: Resend allows
10 requests per second per team, and the Keycloak service sends through the same account, so half
the budget stays with it. The limiter is per worker process, so running more than one API instance
multiplies the effective rate and these numbers need revisiting. Concurrency changes the rate, never
the volume, so the account's daily cap is unaffected.

A send failure the provider can positively identify as transient — a relay that never answered, a
dropped connection, a 4xx SMTP reply — is handed back to the queue rather than written `FAILED`.
The row stays `QUEUED` between attempts, because `processReminder` refuses to act on a row that is
not, and a row reading `FAILED` mid-retry would show an operator a failure still being worked and a
resend they do not need. Three attempts, five seconds before the first retry and sixty before the
second: a blip is usually over in seconds, and anything still failing after that is not a blip.
Anything not positively transient — bad credentials, a bad address, a 5xx reply, an unrecognised
error — stays terminal on the first attempt, as it always was.

Time to send

Recorded as the gap between the later of `createdAt` and `scheduledAt` and `sentAt`, and shown per
row and as a median across the loaded rows. It is derived rather than stored: `sentAt` already
records the fact, and a column holding the arithmetic could only agree with it or be wrong. The
later of the two start points matters — a reminder scheduled for tomorrow is not a day late when it
goes out tomorrow, and averaging the intended wait in with the queue's own delay buries the number
an operator can act on.

Fallback behavior

• no phone and no email: the record is created as FAILED with NO_CONTACT_METHOD and
surfaced in the UI, rather than skipped silently
• email requested with no usable provider: FAILED with EMAIL_CHANNEL_UNAVAILABLE, never
by sending the SMS body to an email address
• queue unreachable: FAILED with QUEUE_UNAVAILABLE, so a Redis outage degrades the
message rather than failing the workflow that triggered it

Offline

If a follow-up is added offline:
• client sync pushes the care plan
• the server schedules the reminder on receipt

Boundary with Keycloak

Verify-email and forgot-password are sent by Keycloak from its own KC*SMTP*\* configuration
on the Keycloak service. The app never reimplements them, and the two SMTP configurations
are independent.

The two configurations are independent but not unrelated. `EMAIL_FROM` and `KC_SMTP_FROM`
must share a domain so SPF and DKIM hold across the pair, and `EMAIL_FROM_NAME` must match
`KC_SMTP_FROM_DISPLAY_NAME` for that environment. A patient receives the portal invite from
the API and the account-setup link from Keycloak moments apart, and the display name is the
most visible thing in an inbox list — more visible than the address, which most clients
hide. Two different names across that pair is what makes the second message, the one
carrying the link, read as a phishing attempt. Nothing in code enforces the match; it is a
deployment convention, recorded in `deploy/env/*.example`.

`EMAIL_FROM` holds the bare address. A display name inlined as `Nkwapa <no-reply@...>` is
still accepted, since it was the only way to set one before `EMAIL_FROM_NAME` existed, but
`EMAIL_FROM_NAME` wins when both are present. The address is validated loosely at config
time — an unusable one is reported as `EMAIL_FROM` missing rather than failing at send.
