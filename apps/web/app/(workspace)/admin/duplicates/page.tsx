'use client';

import { DuplicateReviewScreen } from '@/components/admin/DuplicateReviewScreen';
import { RouteGuard } from '@/components/RouteGuard';

/**
 * The suspected duplicate review queue.
 *
 * `RouteGuard` is the boundary, not the sidebar. Filtering the nav hides the link from someone
 * without the permission; it does nothing about a typed URL, which is what `e2e/portal.spec.js`
 * checks for every staff route.
 */
export default function AdminDuplicatesPage() {
  return (
    <RouteGuard requiredPermission="PATIENT.DUPLICATE.REVIEW">
      <DuplicateReviewScreen />
    </RouteGuard>
  );
}
