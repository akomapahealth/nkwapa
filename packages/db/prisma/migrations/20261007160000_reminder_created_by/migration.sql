-- Who scheduled a reminder directly (#116).
--
-- Staff can now schedule a follow-up reminder for a patient, and cancel one they scheduled while it
-- is still queued. The ledger had no record of who asked for a reminder, because until now every
-- reminder was a side effect of a workflow. Null on every such reminder, which is also what keeps
-- them out of reach of the staff cancel route: their own workflow owns them.

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "createdByUserId" UUID;

-- CreateIndex
CREATE INDEX "Reminder_createdByUserId_idx" ON "Reminder"("createdByUserId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
