-- Station review volunteers submit for any doctor to cosign. The original state check
-- required a manager-assigned doctor, causing these submissions to fail with HTTP 500.
-- Keep every content/signature invariant and require actual review ownership for this path.
ALTER TABLE "ClinicalNote" DROP CONSTRAINT "ClinicalNote_state_check";
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_state_check" CHECK (
    (
      "status" = 'DRAFT'
      AND "submittedByUserId" IS NULL AND "submittedAt" IS NULL
      AND "cosignedByUserId" IS NULL AND "cosignedAt" IS NULL
      AND "signedHistory" IS NULL AND "signedAssessment" IS NULL
      AND "signedPlan" IS NULL AND "signedContentHash" IS NULL
    )
    OR (
      "status" = 'PENDING_COSIGN'
      AND "submittedByUserId" IS NOT NULL AND "submittedAt" IS NOT NULL
      AND (
        "assignedDoctorId" IS NOT NULL
        OR (
          "authorRole" = 'VOLUNTEER' AND "assignmentId" IS NULL
          AND "assignedVolunteerId" IS NOT NULL AND "assignedVolunteerId" = "authorUserId"
          AND "submittedByUserId" = "authorUserId"
          AND "assignedVolunteerNameSnapshot" IS NOT NULL
          AND "assignmentAssignedAtSnapshot" IS NOT NULL
          AND "assignedDoctorNameSnapshot" IS NULL
        )
      )
      AND "cosignedByUserId" IS NULL AND "cosignedAt" IS NULL
      AND "signedHistory" IS NULL AND "signedAssessment" IS NULL
      AND "signedPlan" IS NULL AND "signedContentHash" IS NULL
      AND length(btrim("history")) > 0
      AND length(btrim("assessment")) > 0
      AND length(btrim("plan")) > 0
    )
    OR (
      "status" IN ('COSIGNED', 'AMENDED')
      AND "submittedByUserId" IS NOT NULL AND "submittedAt" IS NOT NULL
      AND "cosignedByUserId" IS NOT NULL AND "cosignedAt" IS NOT NULL
      AND "signedHistory" IS NOT NULL AND length(btrim("signedHistory")) > 0
      AND "signedAssessment" IS NOT NULL AND length(btrim("signedAssessment")) > 0
      AND "signedPlan" IS NOT NULL AND length(btrim("signedPlan")) > 0
      AND "signedContentHash" IS NOT NULL
    )
  );

CREATE FUNCTION app.guard_station_note_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" = 'PENDING_COSIGN' AND NEW."assignedDoctorId" IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "PatientStationVisit" visit
      JOIN "ClinicStation" station ON station."id" = visit."stationId"
      WHERE visit."clinicId" = NEW."clinicId"
        AND station."clinicId" = NEW."clinicId"
        AND station."kind" = 'REVIEW'
        AND visit."encounterId" = NEW."encounterId"
        AND visit."claimedAt" = NEW."assignmentAssignedAtSnapshot"
        AND (
          (visit."status" = 'IN_PROGRESS' AND visit."claimedByUserId" = NEW."authorUserId")
          OR (visit."status" = 'COMPLETED' AND visit."completedByUserId" = NEW."authorUserId")
        )
    ) THEN
      RAISE EXCEPTION 'Unassigned pending notes require the author to own the review station'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClinicalNote_station_submission_guard"
BEFORE INSERT OR UPDATE ON "ClinicalNote"
FOR EACH ROW EXECUTE FUNCTION app.guard_station_note_submission();
