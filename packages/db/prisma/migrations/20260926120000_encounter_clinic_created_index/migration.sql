-- Index encounters by clinic and creation time. Issue #13.
--
-- The organization report counts each clinic's encounters inside a rolling window, and the clinic
-- dashboards already ask the same question for "today" and for their 30-day trends. The existing
-- ("clinicId", "updatedAt") index narrows by clinic but cannot range over "createdAt", so every
-- one of those reads scanned a clinic's whole encounter history to find the last month.
--
-- Additive and data-free. Not CONCURRENTLY: migrations run inside a transaction, and the table is
-- small enough at current volumes for a brief lock at deploy time.

-- CreateIndex
CREATE INDEX "Encounter_clinicId_createdAt_idx" ON "Encounter"("clinicId", "createdAt");
