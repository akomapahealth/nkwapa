'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import {
  RecordSection,
  RecordSectionDescription,
  RecordSectionHeader,
  RecordSectionTitle,
} from '@/components/patients/RecordSection';

export default function ClinicEncountersListPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;

  /*
    This page holds no patient data -- it is a hub of links. It is guarded anyway, because every
    route that names a clinic should refuse before it renders rather than because it happens to
    have nothing to leak today. The API remains the real boundary; this is the one that stops a
    wrong link looking like a working one.
  */
  const links = [
    {
      href: '/queues',
      label: 'Encounter queues',
      detail: 'Drafts, visits waiting for review and visits ready for sign-off.',
    },
    {
      href: `/clinics/${clinicId}/patients`,
      label: 'Clinic patients',
      detail: 'Find a patient to read their history or start a visit.',
    },
    {
      href: '/today',
      label: 'Today board',
      detail: 'Check-ins and assignments on the live clinic board.',
    },
  ];

  return (
    <RouteGuard requiredPermission="ENCOUNTER.READ">
      <div className="space-y-6">
        <AppPageHeader
          eyebrow="Clinic encounters"
          title="Encounters"
          description="Encounters start from a patient record or the clinic board, and wait in the queues until they are signed off."
        />

        <RecordSection aria-labelledby="clinic-encounters-start" className="max-w-3xl">
          <RecordSectionHeader>
            <RecordSectionTitle id="clinic-encounters-start">Where to go</RecordSectionTitle>
            <RecordSectionDescription>
              This clinic has no separate encounter list; these pages hold the work.
            </RecordSectionDescription>
          </RecordSectionHeader>
          <ul className="border-t border-rule">
            {links.map((link) => (
              <li key={link.href} className="border-b border-rule">
                <Link
                  href={link.href}
                  className="flex min-h-11 items-center justify-between gap-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span>
                    <span className="block font-medium text-primary">{link.label}</span>
                    <span className="block text-sm text-muted-foreground">{link.detail}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </RecordSection>
      </div>
    </RouteGuard>
  );
}
