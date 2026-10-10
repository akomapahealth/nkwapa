'use client';

import { useBootstrap } from '@/lib/bootstrap-context';
import { RouteGuard } from '@/components/RouteGuard';
import { ClinicSettingsScreen } from '@/components/settings/ClinicSettingsScreen';

export default function ClinicSettingsPage() {
  /*
    The context value, not `getBootstrapActiveClinicId(bootstrap)`, because only the context
    honours the clinic switcher's override. The bootstrap helper falls back to the first
    switchable clinic, so a director who had switched clinics could have edited the settings of
    a clinic other than the one on screen. It is also exactly what RouteGuard checks below.
  */
  const clinicId = useBootstrap()?.activeClinicId ?? null;

  return (
    <RouteGuard
      requiredPermission="RESEARCH.SETTINGS.UPDATE"
      requiresClinic
      clinicSurface="Clinic settings"
    >
      {/* The guard has already refused this render when no clinic is active; the check only
          states that guarantee in a way the type system can see. */}
      {clinicId ? <ClinicSettingsScreen clinicId={clinicId} /> : null}
    </RouteGuard>
  );
}
