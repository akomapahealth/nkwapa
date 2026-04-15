⸻

/docs/specs/NOTIFICATIONS_SMS_EMAIL_V1.md

Goal

Send reminders for follow-up visits via SMS or email.

Provider abstraction

Backend defines interface:
• sendSMS(to, body, metadata)
• sendEmail(to, subject, body, metadata)

Implementations:
• FakeSmsProvider (dev/free) writes to DB and logs
• TwilioSmsProvider (production optional, behind env flag)
• Email provider optional later

Scheduling

When doctor finalizes encounter with follow_up_date:
• create Reminder record with scheduled_at
• enqueue job in background worker (BullMQ recommended with Redis)

Endpoints
• POST /clinics/:clinicId/reminders/test (admin only in dev)
• GET /clinics/:clinicId/reminders (manager/director)

Offline

If follow-up added offline:
• client sync pushes care plan
• server schedules reminder upon receipt
• SMS sending requires phone_e164 valid
• fallback behavior:
• if no phone and no email: reminder is created as FAILED with reason NO_CONTACT_METHOD (and surfaced in UI)
