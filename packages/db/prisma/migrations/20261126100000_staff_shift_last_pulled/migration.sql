-- The last sync pull by the person on a shift, for the "Ready to open" check (#411).
-- Re-runnable: Prisma does not wrap a migration in one transaction.
ALTER TABLE "StaffShift" ADD COLUMN IF NOT EXISTS "lastPulledAt" TIMESTAMP(3);

-- Offline grants are readable only by their owner. The "Ready to open" check needs to know which
-- people on shift hold a current one, so this returns just those user ids: only for someone on an
-- active shift at this clinic, and only to the roles that run the line.
CREATE OR REPLACE FUNCTION app.offline_ready_shift_users(clinic_uuid UUID)
RETURNS TABLE (user_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (
    app.has_clinic_role(clinic_uuid, ARRAY['DIRECTOR', 'MANAGER']::"UserRole"[])
    OR app.is_system_admin()
  ) THEN
    RAISE EXCEPTION 'Offline readiness is not available' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT shift."userId"
  FROM "StaffShift" shift
  JOIN "OfflineGrant" grant_row ON grant_row."userId" = shift."userId"
  WHERE shift."clinicId" = clinic_uuid
    AND shift."status" = 'ACTIVE'
    AND grant_row."revokedAt" IS NULL
    AND grant_row."expiresAt" > CURRENT_TIMESTAMP;
END;
$$;

REVOKE ALL ON FUNCTION app.offline_ready_shift_users(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.offline_ready_shift_users(UUID) TO PUBLIC;
