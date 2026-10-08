-- Who handed a patient to the person holding them at a station.
--
-- Staff take patients at a station themselves (#167). A manager can now also hand a queued patient
-- to a named volunteer or doctor on shift, so the patient does not wait for someone to notice them.
-- The claim itself is unchanged; this column only records that a manager made it. Null for a
-- self-claim, and cleared whenever the claim ends without completing.

-- AlterTable
ALTER TABLE "PatientStationVisit" ADD COLUMN "assignedByUserId" UUID;

-- AddForeignKey
ALTER TABLE "PatientStationVisit" ADD CONSTRAINT "PatientStationVisit_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
