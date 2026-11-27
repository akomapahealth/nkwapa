-- The pulse of each BP reading at one sitting (2026-11-21); pulseBpm keeps their average.
ALTER TABLE "Vitals" ADD COLUMN "pulseReadings" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
