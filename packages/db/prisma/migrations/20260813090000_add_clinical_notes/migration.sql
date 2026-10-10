CREATE TYPE "ClinicalNoteStatus" AS ENUM ('DRAFT', 'PENDING_COSIGN', 'COSIGNED', 'AMENDED');

CREATE TABLE "ClinicalNote" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "patientId" UUID NOT NULL,
  "encounterId" UUID NOT NULL,
  "status" "ClinicalNoteStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "history" TEXT NOT NULL DEFAULT '',
  "assessment" TEXT NOT NULL DEFAULT '',
  "plan" TEXT NOT NULL DEFAULT '',
  "signedHistory" TEXT,
  "signedAssessment" TEXT,
  "signedPlan" TEXT,
  "signedContentHash" VARCHAR(64),
  "authorUserId" UUID NOT NULL,
  "authorRole" "UserRole" NOT NULL,
  "assignmentId" UUID,
  "assignedVolunteerId" UUID,
  "assignedVolunteerNameSnapshot" VARCHAR(200),
  "assignedDoctorId" UUID,
  "assignedDoctorNameSnapshot" VARCHAR(200),
  "assignmentAssignedAtSnapshot" TIMESTAMP(3),
  "submittedByUserId" UUID,
  "submittedAt" TIMESTAMP(3),
  "cosignedByUserId" UUID,
  "cosignedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalNote_version_check" CHECK ("version" > 0),
  CONSTRAINT "ClinicalNote_author_role_check" CHECK ("authorRole" IN ('DOCTOR', 'VOLUNTEER')),
  CONSTRAINT "ClinicalNote_signed_hash_check" CHECK (
    "signedContentHash" IS NULL OR "signedContentHash" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "ClinicalNote_state_check" CHECK (
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
      AND "assignedDoctorId" IS NOT NULL
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
  )
);

CREATE TABLE "ClinicalNoteAddendum" (
  "id" UUID NOT NULL,
  "clinicId" UUID NOT NULL,
  "clinicalNoteId" UUID NOT NULL,
  "authorUserId" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicalNoteAddendum_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicalNoteAddendum_reason_check" CHECK (length(btrim("reason")) > 0),
  CONSTRAINT "ClinicalNoteAddendum_content_check" CHECK (length(btrim("content")) > 0)
);

CREATE UNIQUE INDEX "ClinicalNote_encounterId_key" ON "ClinicalNote"("encounterId");
CREATE INDEX "ClinicalNote_clinicId_patientId_createdAt_idx" ON "ClinicalNote"("clinicId", "patientId", "createdAt");
CREATE INDEX "ClinicalNote_clinicId_status_assignedDoctorId_submittedAt_idx" ON "ClinicalNote"("clinicId", "status", "assignedDoctorId", "submittedAt");
CREATE INDEX "ClinicalNote_authorUserId_status_updatedAt_idx" ON "ClinicalNote"("authorUserId", "status", "updatedAt");
CREATE INDEX "ClinicalNote_assignmentId_idx" ON "ClinicalNote"("assignmentId");
CREATE INDEX "ClinicalNoteAddendum_clinicalNoteId_createdAt_idx" ON "ClinicalNoteAddendum"("clinicalNoteId", "createdAt");
CREATE INDEX "ClinicalNoteAddendum_clinicId_createdAt_idx" ON "ClinicalNoteAddendum"("clinicId", "createdAt");
CREATE INDEX "ClinicalNoteAddendum_authorUserId_createdAt_idx" ON "ClinicalNoteAddendum"("authorUserId", "createdAt");

ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "PatientAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_assignedVolunteerId_fkey" FOREIGN KEY ("assignedVolunteerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_assignedDoctorId_fkey" FOREIGN KEY ("assignedDoctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_cosignedByUserId_fkey" FOREIGN KEY ("cosignedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNoteAddendum" ADD CONSTRAINT "ClinicalNoteAddendum_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNoteAddendum" ADD CONSTRAINT "ClinicalNoteAddendum_clinicalNoteId_fkey" FOREIGN KEY ("clinicalNoteId") REFERENCES "ClinicalNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalNoteAddendum" ADD CONSTRAINT "ClinicalNoteAddendum_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION app.has_clinic_role(clinic_uuid UUID, allowed_roles "UserRole"[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "UserClinicRole" role_assignment
    JOIN "User" app_user ON app_user."id" = role_assignment."userId"
    WHERE role_assignment."userId" = app.current_user_id()
      AND role_assignment."clinicId" = clinic_uuid
      AND role_assignment."role" = ANY(allowed_roles)
      AND app_user."isActive" = true
  )
$$;

CREATE OR REPLACE FUNCTION app.validate_clinical_note_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Encounter" encounter
    WHERE encounter."id" = NEW."encounterId"
      AND encounter."clinicId" = NEW."clinicId"
      AND encounter."patientId" = NEW."patientId"
  ) THEN
    RAISE EXCEPTION 'Clinical note encounter, patient, and clinic must match' USING ERRCODE = '23514';
  END IF;

  IF NEW."assignmentId" IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM "PatientAssignment" assignment
    JOIN "PatientCheckIn" check_in ON check_in."id" = assignment."patientCheckInId"
    WHERE assignment."id" = NEW."assignmentId"
      AND assignment."clinicId" = NEW."clinicId"
      AND check_in."encounterId" = NEW."encounterId"
      AND (NEW."assignedVolunteerId" IS NULL OR assignment."assignedVolunteerId" = NEW."assignedVolunteerId")
      AND (NEW."assignedDoctorId" IS NULL OR assignment."assignedDoctorId" = NEW."assignedDoctorId")
  ) THEN
    RAISE EXCEPTION 'Clinical note assignment must belong to the encounter and care team' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClinicalNote_scope_guard"
BEFORE INSERT OR UPDATE ON "ClinicalNote"
FOR EACH ROW EXECUTE FUNCTION app.validate_clinical_note_scope();

CREATE OR REPLACE FUNCTION app.guard_clinical_note_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'Submitted or signed clinical notes cannot be deleted' USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."clinicId" IS DISTINCT FROM OLD."clinicId"
    OR NEW."patientId" IS DISTINCT FROM OLD."patientId"
    OR NEW."encounterId" IS DISTINCT FROM OLD."encounterId"
    OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
    OR NEW."authorRole" IS DISTINCT FROM OLD."authorRole"
    OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Clinical note identity and authorship are immutable' USING ERRCODE = '55000';
  END IF;

  IF NOT (
    (OLD."status" = 'DRAFT' AND NEW."status" IN ('DRAFT', 'PENDING_COSIGN', 'COSIGNED'))
    OR (OLD."status" = 'PENDING_COSIGN' AND NEW."status" IN ('PENDING_COSIGN', 'COSIGNED'))
    OR (OLD."status" = 'COSIGNED' AND NEW."status" IN ('COSIGNED', 'AMENDED'))
    OR (OLD."status" = 'AMENDED' AND NEW."status" = 'AMENDED')
  ) THEN
    RAISE EXCEPTION 'Invalid clinical note lifecycle transition' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" <> 'DRAFT' AND (
    NEW."history" IS DISTINCT FROM OLD."history"
    OR NEW."assessment" IS DISTINCT FROM OLD."assessment"
    OR NEW."plan" IS DISTINCT FROM OLD."plan"
    OR NEW."assignmentId" IS DISTINCT FROM OLD."assignmentId"
    OR NEW."assignedVolunteerId" IS DISTINCT FROM OLD."assignedVolunteerId"
    OR NEW."assignedVolunteerNameSnapshot" IS DISTINCT FROM OLD."assignedVolunteerNameSnapshot"
    OR NEW."assignedDoctorId" IS DISTINCT FROM OLD."assignedDoctorId"
    OR NEW."assignedDoctorNameSnapshot" IS DISTINCT FROM OLD."assignedDoctorNameSnapshot"
    OR NEW."assignmentAssignedAtSnapshot" IS DISTINCT FROM OLD."assignmentAssignedAtSnapshot"
    OR NEW."submittedByUserId" IS DISTINCT FROM OLD."submittedByUserId"
    OR NEW."submittedAt" IS DISTINCT FROM OLD."submittedAt"
  ) THEN
    RAISE EXCEPTION 'Submitted clinical note content and assignment are immutable' USING ERRCODE = '55000';
  END IF;

  IF OLD."status" IN ('COSIGNED', 'AMENDED') AND (
    NEW."signedHistory" IS DISTINCT FROM OLD."signedHistory"
    OR NEW."signedAssessment" IS DISTINCT FROM OLD."signedAssessment"
    OR NEW."signedPlan" IS DISTINCT FROM OLD."signedPlan"
    OR NEW."signedContentHash" IS DISTINCT FROM OLD."signedContentHash"
    OR NEW."cosignedByUserId" IS DISTINCT FROM OLD."cosignedByUserId"
    OR NEW."cosignedAt" IS DISTINCT FROM OLD."cosignedAt"
  ) THEN
    RAISE EXCEPTION 'Signed clinical note content is immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClinicalNote_immutability_guard"
BEFORE UPDATE OR DELETE ON "ClinicalNote"
FOR EACH ROW EXECUTE FUNCTION app.guard_clinical_note_immutability();

CREATE OR REPLACE FUNCTION app.guard_clinical_note_addendum_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Clinical note addenda are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "ClinicalNoteAddendum_append_only_guard"
BEFORE UPDATE OR DELETE ON "ClinicalNoteAddendum"
FOR EACH ROW EXECUTE FUNCTION app.guard_clinical_note_addendum_append_only();

ALTER TABLE "ClinicalNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicalNoteAddendum" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ClinicalNote_clinical_role_policy" ON "ClinicalNote" FOR ALL
USING (
  app.can_access_clinic("clinicId")
  AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER']::"UserRole"[])
)
WITH CHECK (
  app.can_access_clinic("clinicId")
  AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER']::"UserRole"[])
);

CREATE POLICY "ClinicalNoteAddendum_clinical_role_policy" ON "ClinicalNoteAddendum" FOR ALL
USING (
  app.can_access_clinic("clinicId")
  AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER']::"UserRole"[])
  AND EXISTS (
    SELECT 1 FROM "ClinicalNote" note
    WHERE note."id" = "clinicalNoteId" AND note."clinicId" = "clinicId"
  )
)
WITH CHECK (
  app.can_access_clinic("clinicId")
  AND app.has_clinic_role("clinicId", ARRAY['DOCTOR', 'VOLUNTEER']::"UserRole"[])
  AND EXISTS (
    SELECT 1 FROM "ClinicalNote" note
    WHERE note."id" = "clinicalNoteId" AND note."clinicId" = "clinicId"
  )
);

CREATE OR REPLACE FUNCTION app.clinical_note_pending_count(clinic_uuid UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  pending_count INTEGER;
BEGIN
  IF NOT app.has_clinic_role(
    clinic_uuid,
    ARRAY['DIRECTOR', 'MANAGER', 'DOCTOR', 'VOLUNTEER']::"UserRole"[]
  ) THEN
    RAISE EXCEPTION 'Clinical note operational status is not available' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::INTEGER INTO pending_count
  FROM "ClinicalNote"
  WHERE "clinicId" = clinic_uuid AND "status" = 'PENDING_COSIGN';

  RETURN pending_count;
END;
$$;

REVOKE ALL ON FUNCTION app.clinical_note_pending_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.clinical_note_pending_count(UUID) TO PUBLIC;
