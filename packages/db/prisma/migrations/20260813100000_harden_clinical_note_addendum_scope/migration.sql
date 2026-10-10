CREATE OR REPLACE FUNCTION app.validate_clinical_note_addendum_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "ClinicalNote" note
    WHERE note."id" = NEW."clinicalNoteId"
      AND note."clinicId" = NEW."clinicId"
  ) THEN
    RAISE EXCEPTION 'Clinical note addendum must belong to the same clinic as its note'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "ClinicalNoteAddendum_scope_guard"
BEFORE INSERT ON "ClinicalNoteAddendum"
FOR EACH ROW EXECUTE FUNCTION app.validate_clinical_note_addendum_scope();
