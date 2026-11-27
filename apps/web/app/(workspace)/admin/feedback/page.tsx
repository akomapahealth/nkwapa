'use client';

import { StaffFeedbackScreen } from '@/components/admin/StaffFeedbackScreen';
import { RouteGuard } from '@/components/RouteGuard';

/** Problems staff reported from inside the app (#422). The guard, not the nav, is the boundary. */
export default function AdminFeedbackPage() {
  return (
    <RouteGuard requiredPermission="FEEDBACK.READ">
      <StaffFeedbackScreen />
    </RouteGuard>
  );
}
