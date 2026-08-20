'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { RouteGuard } from '@/components/RouteGuard';
import { InlineErrorState, SectionSkeleton } from '@/components/feedback/AppState';
import { Button } from '@/components/ui/button';
import { CHART_TAB_PARAM } from '@/lib/patient-chart';

/**
 * Legacy chart route.
 *
 * The canonical chart lives at /clinics/[clinicId]/patients/[patientId] so clinic context
 * stays in the URL. This route stays working for existing links and redirects there,
 * carrying the requested ?tab= across so deep links survive.
 *
 * It deliberately does not fetch the patient: the canonical chart already resolves merged
 * charts and owns the loading, offline, error, and not-found states, so duplicating any of
 * that here is how the two pages drifted apart in the first place.
 */
function LegacyPatientChartRedirect() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bootstrap = useBootstrap();
  const patientId = params.patientId as string;
  const clinicId = getBootstrapActiveClinicId(bootstrap?.bootstrap ?? null);
  const isLoading = bootstrap?.isLoading ?? true;

  const destination = useMemo(() => {
    if (!clinicId || !patientId) return null;
    const requestedTab = searchParams.get(CHART_TAB_PARAM);
    const base = `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}`;
    return requestedTab ? `${base}?${CHART_TAB_PARAM}=${encodeURIComponent(requestedTab)}` : base;
  }, [clinicId, patientId, searchParams]);

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (destination || isLoading) {
    return (
      <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
        <span className="sr-only">Opening patient chart</span>
        <SectionSkeleton lines={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <InlineErrorState
        title="No active clinic"
        description="Select a clinic before opening a patient chart. Charts are scoped to the clinic you are working in."
      />
      <Button asChild variant="outline" className="rounded-2xl">
        <Link href="/dashboard">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  );
}

export default function LegacyPatientDetailPage() {
  return (
    <RouteGuard requiredPermission="PATIENT.READ">
      <LegacyPatientChartRedirect />
    </RouteGuard>
  );
}
