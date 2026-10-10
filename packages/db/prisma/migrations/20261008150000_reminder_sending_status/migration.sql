-- A reminder a worker is sending right now (#164).
--
-- The provider call used to run inside the job's database transaction. When that transaction
-- outlived its timeout after the provider had accepted the message, the SENT write rolled back and
-- the retry sent the message again. The worker now commits SENDING before the call and records the
-- outcome afterwards in a second transaction. A row left in SENDING means nobody knows whether the
-- message went, and the reconciliation sweep records that instead of resending it.
--
-- ADD VALUE on its own: Postgres will not let a transaction use an enum value it added.
ALTER TYPE "ReminderStatus" ADD VALUE IF NOT EXISTS 'SENDING' AFTER 'QUEUED';
