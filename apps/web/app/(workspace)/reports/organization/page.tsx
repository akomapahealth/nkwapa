'use client';

import { OrganizationReportScreen } from '@/components/reports/OrganizationReportScreen';
import { RouteGuard } from '@/components/RouteGuard';

/**
 * `RouteGuard` is the boundary for a typed URL; the API refuses anyone else regardless.
 */
export default function OrganizationReportPage() {
  return (
    <RouteGuard requiredPermission="ORGANIZATION.REPORT.READ">
      <OrganizationReportScreen />
    </RouteGuard>
  );
}
