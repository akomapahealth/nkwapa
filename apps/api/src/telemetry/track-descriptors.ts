/**
 * Result-to-property mappings shared by the routes that emit the same event.
 *
 * Each returns only enumerated values the catalog allows; the sanitizer checks again regardless.
 */

const REQUEST_KIND: Record<string, 'NEW' | 'RESCHEDULE' | 'CANCEL'> = {
  NEW_APPOINTMENT: 'NEW',
  RESCHEDULE_APPOINTMENT: 'RESCHEDULE',
  CANCEL_APPOINTMENT: 'CANCEL',
};

/** Which kind of appointment request a serialized request (or `{ request }`) is. */
export function appointmentRequestKind(result: unknown): Record<string, unknown> {
  const source = (result as { request?: unknown })?.request ?? result;
  const type = (source as { requestType?: unknown })?.requestType;
  return typeof type === 'string' && REQUEST_KIND[type] ? { kind: REQUEST_KIND[type] } : {};
}

/** What a merge preview found, as counts. */
export function mergePreviewShape(result: unknown): Record<string, unknown> {
  const preview = result as { blockers?: unknown[]; warnings?: unknown[] };
  const blockerCount = Array.isArray(preview?.blockers) ? preview.blockers.length : 0;
  return {
    blocked: blockerCount > 0,
    blockerCount,
    warningCount: Array.isArray(preview?.warnings) ? preview.warnings.length : 0,
  };
}

/** How large the cross-clinic duplicate picture was when someone looked at it, as counts. */
export function crossClinicInvestigationShape(result: unknown): Record<string, unknown> {
  const burden = (result as { burden?: { totalPairs?: unknown; clinicPairs?: unknown[] } })?.burden;
  return {
    pairCount: typeof burden?.totalPairs === 'number' ? burden.totalPairs : 0,
    clinicPairCount: Array.isArray(burden?.clinicPairs) ? burden.clinicPairs.length : 0,
    truncated: (result as { truncated?: unknown })?.truncated === true,
  };
}

/** Whether a portal invitation reached an account and an inbox. */
export function portalInviteShape(result: unknown): Record<string, unknown> {
  const invite = result as {
    identity?: { status?: unknown };
    emailDelivery?: { status?: unknown } | null;
  };
  return {
    identity: invite?.identity?.status,
    delivery: invite?.emailDelivery ? invite.emailDelivery.status : 'NOT_SENT',
  };
}

/** The canonical chart's clinic in a merge preview. */
export function mergePreviewClinic(result: unknown): string | undefined {
  const id = (result as { canonical?: { clinic?: { id?: unknown } } })?.canonical?.clinic?.id;
  return typeof id === 'string' ? id : undefined;
}

/** The clinic a merge result reports. */
export function mergeResultClinic(result: unknown): string | undefined {
  const id = (result as { clinicId?: unknown })?.clinicId;
  return typeof id === 'string' ? id : undefined;
}
