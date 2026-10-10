-- CreateEnum
CREATE TYPE "AppointmentRequestType" AS ENUM ('NEW_APPOINTMENT', 'CANCEL_APPOINTMENT', 'RESCHEDULE_APPOINTMENT');

-- AlterTable
ALTER TABLE "AppointmentRequest"
ADD COLUMN "requestType" "AppointmentRequestType" NOT NULL DEFAULT 'NEW_APPOINTMENT',
ADD COLUMN "sourceAppointmentId" UUID;

-- CreateIndex
CREATE INDEX "AppointmentRequest_sourceAppointmentId_idx" ON "AppointmentRequest"("sourceAppointmentId");

-- AddForeignKey
ALTER TABLE "AppointmentRequest" ADD CONSTRAINT "AppointmentRequest_sourceAppointmentId_fkey" FOREIGN KEY ("sourceAppointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
