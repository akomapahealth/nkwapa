'use client';

import type { WhoAmIResponse } from './bootstrap-context';
import { getBootstrapActiveClinicId, getSwitchableClinics } from './bootstrap-clinics';
import { useOutboxQueue } from './use-outbox-queue';
import { useOtherClinicQueues } from './other-clinic-queue';

/** Mirror the existing sync center's eligibility, including held changes on shared devices. */
export function useSyncRecoveryAvailability(bootstrap: WhoAmIResponse | null) {
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const permissions = bootstrap?.effectivePermissionsForActiveClinic ?? [];
  const canSync =
    permissions.includes('*') ||
    (permissions.includes('SYNC.PUSH') && permissions.includes('SYNC.PULL'));
  const queue = useOutboxQueue(clinicId, bootstrap?.userId ?? null);
  const otherClinics = useOtherClinicQueues({
    activeClinicId: clinicId,
    currentUserId: bootstrap?.userId ?? null,
    accessibleClinics: getSwitchableClinics(bootstrap),
  });
  return Boolean(
    clinicId &&
    (canSync ||
      queue.total > 0 ||
      queue.held.length > 0 ||
      otherClinics.some((other) => other.own.length > 0 || other.others.length > 0)),
  );
}
