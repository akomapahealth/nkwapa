-- Practice sessions (#410). Re-runnable: IF NOT EXISTS, DROP/CREATE, and grants repeat safely.

-- When a director last cleared a practice chart. The chart stays (finalized history is never
-- deleted) and stays out of every report through "isDemo".
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "demoClearedAt" TIMESTAMP(3);

-- RLS shows clinical notes to DOCTOR and VOLUNTEER seats only, so a director cannot see a demo
-- visit's note. These two functions see them for one clinic's demo charts, return ids only, and
-- refuse anyone but a director or system admin. Real charts are never touched.

-- Deletes the DRAFT notes on DRAFT demo visits: exactly the notes whose visits the API deletes next.
DROP FUNCTION IF EXISTS app.practice_clear_draft_notes(UUID);
CREATE FUNCTION app.practice_clear_draft_notes(clinic_uuid UUID)
RETURNS TABLE(note_id UUID, encounter_id UUID)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    app.is_system_admin()
    OR app.has_clinic_role(clinic_uuid, ARRAY['DIRECTOR']::"UserRole"[])
  ) THEN
    RAISE EXCEPTION 'Practice patients are managed by a director' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  DELETE FROM "ClinicalNote" note
  USING "Encounter" encounter, "Patient" patient
  WHERE note."clinicId" = clinic_uuid
    AND note."status" = 'DRAFT'
    AND encounter."id" = note."encounterId"
    AND encounter."status" = 'DRAFT'
    AND patient."id" = note."patientId"
    AND patient."isDemo" = true
  RETURNING note."id", note."encounterId";
END;
$$;

-- DRAFT demo visits whose note was already submitted. Clearing keeps them, so neither the count
-- nor the confirmation promises to delete them.
CREATE OR REPLACE FUNCTION app.practice_kept_draft_visits(clinic_uuid UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    app.is_system_admin()
    OR app.has_clinic_role(clinic_uuid, ARRAY['DIRECTOR']::"UserRole"[])
  ) THEN
    RAISE EXCEPTION 'Practice patients are managed by a director' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT encounter."id"
  FROM "Encounter" encounter
  JOIN "Patient" patient ON patient."id" = encounter."patientId"
  JOIN "ClinicalNote" note ON note."encounterId" = encounter."id"
  WHERE encounter."clinicId" = clinic_uuid
    AND encounter."status" = 'DRAFT'
    AND patient."isDemo" = true
    AND note."status" <> 'DRAFT';
END;
$$;

REVOKE ALL ON FUNCTION app.practice_clear_draft_notes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.practice_clear_draft_notes(UUID) TO PUBLIC;
REVOKE ALL ON FUNCTION app.practice_kept_draft_visits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.practice_kept_draft_visits(UUID) TO PUBLIC;
