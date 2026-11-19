'use client';

import { useClinicUnits } from '@/lib/bootstrap-context';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionHeader as CardHeader,
} from '@/components/patients/RecordSection';
import { formatOpsDateTime } from '@/lib/ops';
import { glanceLines } from '@/lib/patient-chart-glance';
import type { ChartGlance, PatientChartSectionId } from '@/lib/patient-chart';
import { cn } from '@/lib/utils';
import { SectionLink } from './ChartSectionLink';

/**
 * The patient in a few seconds (#341): labelled lines built from recorded data by fixed rules,
 * each linking to the tab it summarises. Nothing here is generated text.
 */
export function PatientChartGlance({
  clinicId,
  patientId,
  glance,
  sections,
  onNavigate,
}: {
  clinicId: string;
  patientId: string;
  glance: ChartGlance;
  sections: ReadonlyArray<{ id: PatientChartSectionId }>;
  onNavigate?: (section: PatientChartSectionId) => void;
}) {
  const units = useClinicUnits(clinicId);
  const lines = glanceLines(glance, units, (section) => sections.some((s) => s.id === section));
  if (!lines.length) return null;

  return (
    <Card aria-labelledby="chart-glance-title">
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="chart-glance-title" className="type-section-title">
            At a glance
          </h2>
          {/* #336 places the patient's risk tier badge here, beside the title. */}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          From recorded data, as of {formatOpsDateTime(glance.generatedAt)}.
        </p>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-rule">
          {lines.map((line) => (
            <div
              key={line.id}
              data-glance-line={line.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto]"
            >
              <dt className="text-sm font-medium text-muted-foreground">{line.label}</dt>
              <dd
                className={cn(
                  'col-span-2 row-start-2 break-words pb-2 text-sm leading-6 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:pb-0',
                  line.empty ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {line.text}
              </dd>
              <dd className="col-start-2 row-start-1 sm:col-start-3">
                <SectionLink
                  clinicId={clinicId}
                  patientId={patientId}
                  section={line.section}
                  onNavigate={onNavigate}
                >
                  View<span className="sr-only"> {line.label.toLowerCase()}</span>
                </SectionLink>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
