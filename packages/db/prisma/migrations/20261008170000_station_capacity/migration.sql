-- How many patients a station can see at once (#32): chairs, BP cuffs, a consulting room.
--
-- Stations are the clinic's resources in the station workflow (#167). Capacity next to the staff
-- on a station is what tells a manager whether a queue is waiting for people or for equipment.
-- Every existing station starts at 1, which is how the line has been run.

-- AlterTable
ALTER TABLE "ClinicStation" ADD COLUMN "capacity" INTEGER NOT NULL DEFAULT 1;

-- A station that can see nobody is a closed station, which `active` already says.
ALTER TABLE "ClinicStation" ADD CONSTRAINT "ClinicStation_capacity_check" CHECK ("capacity" BETWEEN 1 AND 50);
