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
