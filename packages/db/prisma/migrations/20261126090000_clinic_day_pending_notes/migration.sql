-- The clinic day summary (#421) needs notes waiting for cosign from one day's real patients.
-- RLS keeps notes from managers, so, like app.clinical_note_pending_count, this returns only a
-- count. Re-runnable: CREATE OR REPLACE, and the grants repeat safely.
CREATE OR REPLACE FUNCTION app.clinical_note_pending_count_for_day(
  clinic_uuid UUID,
  day_start TIMESTAMP(3),
  day_end TIMESTAMP(3)
)
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
  FROM "ClinicalNote" note
  JOIN "PatientCheckIn" check_in ON check_in."encounterId" = note."encounterId"
  JOIN "Patient" patient ON patient."id" = check_in."patientId"
  WHERE note."clinicId" = clinic_uuid
    AND note."status" = 'PENDING_COSIGN'
    AND check_in."clinicId" = clinic_uuid
    AND check_in."checkedInAt" BETWEEN day_start AND day_end
    AND patient."isDemo" = false;

  RETURN pending_count;
END;
$$;

REVOKE ALL ON FUNCTION app.clinical_note_pending_count_for_day(UUID, TIMESTAMP(3), TIMESTAMP(3)) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.clinical_note_pending_count_for_day(UUID, TIMESTAMP(3), TIMESTAMP(3)) TO PUBLIC;
