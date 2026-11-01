'use client';

import { DataRequestsScreen } from '@/components/admin/DataRequestsScreen';
import { RouteGuard } from '@/components/RouteGuard';

/** Patients' data rights requests for the active clinic. The guard, not the nav, is the boundary. */
export default function AdminDataRequestsPage() {
  return (
    <RouteGuard requiredPermission="PATIENT.DATA_REQUEST.MANAGE">
      <DataRequestsScreen />
    </RouteGuard>
  );
}
