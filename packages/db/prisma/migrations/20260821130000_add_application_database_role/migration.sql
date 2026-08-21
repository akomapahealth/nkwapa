-- A dedicated, unprivileged role for the application to connect as.
--
-- Forcing row level security is necessary but not sufficient: PostgreSQL also exempts superusers
-- and any role holding BYPASSRLS, and the application has been connecting as the same superuser
-- that owns the tables. Under that role the policies never applied, whatever FORCE said.
--
-- Ownership and migrations stay with the existing role. This role gets data access only, so a
-- future grant cannot quietly reopen the bypass.
--
-- Role creation is tolerated rather than required, because a deployment whose migration credential
-- cannot CREATE ROLE will provision it out of band. The application refuses to start against a
-- bypassing role, so a skipped provision surfaces at boot instead of becoming a silent hole.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nkwapa_app') THEN
    BEGIN
      CREATE ROLE nkwapa_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Could not create role nkwapa_app; provision it manually before pointing the application at this database.';
    END;
  ELSE
    -- Never let an existing role keep the bypass.
    BEGIN
      ALTER ROLE nkwapa_app NOSUPERUSER NOBYPASSRLS;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'Could not alter role nkwapa_app; verify it holds neither SUPERUSER nor BYPASSRLS.';
    END;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nkwapa_app') THEN
    RETURN;
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO nkwapa_app';
  EXECUTE 'GRANT USAGE ON SCHEMA app TO nkwapa_app';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nkwapa_app';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nkwapa_app';
  EXECUTE 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO nkwapa_app';

  -- The migration history is the owner's bookkeeping, not the application's. It is absent when
  -- these files are replayed directly into a scratch database, as the integration suites do.
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = '_prisma_migrations'
  ) THEN
    EXECUTE 'REVOKE ALL ON TABLE "_prisma_migrations" FROM nkwapa_app';
  END IF;

  -- Tables and functions added by later migrations must be reachable without revisiting this file.
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nkwapa_app';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nkwapa_app';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO nkwapa_app';
END
$$;
