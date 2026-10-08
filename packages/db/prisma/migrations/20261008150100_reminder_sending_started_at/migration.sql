-- When a worker claimed a reminder to send it (#164). The sweep reads it to tell a send still in
-- flight from one whose worker died.

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "sendingStartedAt" TIMESTAMP(3);

-- The sweep's query: in-flight rows, oldest claim first. Partial, because almost no row is ever
-- in this state.
CREATE INDEX "Reminder_sending_started_idx" ON "Reminder"("sendingStartedAt")
  WHERE "status" = 'SENDING';
