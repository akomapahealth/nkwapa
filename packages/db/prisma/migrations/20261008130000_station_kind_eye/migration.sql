-- The Eye station (UCC eye team): visual acuity, penlight examination and ophthalmoscopy.
--
-- On its own because Postgres will not let a transaction use an enum value it added, and the next
-- migration inserts EYE stations.
ALTER TYPE "StationKind" ADD VALUE IF NOT EXISTS 'EYE' BEFORE 'REVIEW';
