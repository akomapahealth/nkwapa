-- #384: a SYSTEM_ADMIN may delete a DRAFT clinical note made by accident.
-- The clinical-role policy only admits DOCTOR and VOLUNTEER seats, so a global admin could not
-- see the row to delete it. These permissive policies add drafts only, for SELECT (DELETE needs
-- to read the row) and DELETE. The immutability trigger still refuses deleting any non-draft.
-- The API asserts the seat and the DRAFT status again inside its transaction.

CREATE POLICY "ClinicalNote_system_admin_draft_select" ON "ClinicalNote" FOR SELECT
USING (app.is_system_admin() AND "status" = 'DRAFT');

CREATE POLICY "ClinicalNote_system_admin_draft_delete" ON "ClinicalNote" FOR DELETE
USING (app.is_system_admin() AND "status" = 'DRAFT');
