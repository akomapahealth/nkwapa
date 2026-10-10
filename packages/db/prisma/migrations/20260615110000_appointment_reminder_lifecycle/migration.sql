ALTER TABLE "Reminder" ADD COLUMN "appointmentId" UUID;

UPDATE "Reminder"
SET "appointmentId" = ((regexp_match("payloadJson", '"appointmentId":"([0-9a-fA-F-]{36})"'))[1])::uuid
WHERE "templateKey" = 'APPOINTMENT_REMINDER_V1'
  AND "appointmentId" IS NULL
  AND "payloadJson" ~ '"appointmentId":"[0-9a-fA-F-]{36}"'
  AND EXISTS (
    SELECT 1
    FROM "Appointment"
    WHERE "Appointment"."id" =
      ((regexp_match("Reminder"."payloadJson", '"appointmentId":"([0-9a-fA-F-]{36})"'))[1])::uuid
  );

CREATE INDEX "Reminder_appointmentId_idx" ON "Reminder"("appointmentId");

ALTER TABLE "Reminder"
ADD CONSTRAINT "Reminder_appointmentId_fkey"
FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
