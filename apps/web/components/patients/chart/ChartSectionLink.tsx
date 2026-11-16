'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { buildChartHref, type PatientChartSectionId } from '@/lib/patient-chart';

export function SectionLink({
  clinicId,
  patientId,
  section,
  children,
  onNavigate,
}: {
  clinicId: string;
  patientId: string;
  section: PatientChartSectionId;
  children: ReactNode;
  onNavigate?: (section: PatientChartSectionId) => void;
}) {
  return (
    <Link
      href={buildChartHref(clinicId, patientId, section)}
      onClick={(event) => {
        // Keep a real href so the link is shareable and can be opened in a new tab, but
        // switch in place when we can: a full navigation would fail on an offline device.
        if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey) {
          event.preventDefault();
          onNavigate(section);
        }
      }}
      className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 transition-colors duration-150 hover:underline"
    >
      {children}
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}
