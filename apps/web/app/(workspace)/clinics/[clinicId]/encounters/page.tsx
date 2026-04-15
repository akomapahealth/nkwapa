'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ClipboardList, FileText, Stethoscope } from 'lucide-react';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function ClinicEncountersListPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Clinic encounters"
        title="Encounter Queue"
        description="This clinic-scoped queue is ready for the richer shared shell and will expand into a full encounter management surface. For now, start an encounter from a patient record or OPS handoff."
        actions={
          <Button asChild>
            <Link href={`/clinics/${clinicId}/patients`}>
              <FileText className="h-4 w-4" />
              Go to Patients
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AppMetricCard
          title="Queue state"
          value="Preparing"
          icon={ClipboardList}
          detail="Encounter work currently begins from patient records and assignments."
        />
        <AppMetricCard
          title="Best entry point"
          value="Patients"
          icon={FileText}
          detail="Search a patient to review history, open trends, or start intake."
        />
        <AppMetricCard
          title="Clinic flow"
          value="OPS ready"
          icon={Stethoscope}
          detail="Check-ins and assignments continue through the live clinic board."
        />
      </div>

      <Card className="max-w-3xl rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
        <CardHeader>
          <CardTitle className="text-xl">Encounter queue rollout</CardTitle>
          <CardDescription>
            A dedicated clinic encounter queue will land here next. Until then, the patient registry
            remains the fastest path into active care.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild className="rounded-2xl">
            <Link href={`/clinics/${clinicId}/patients`}>
              <FileText className="h-4 w-4" />
              Open clinic patients
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-2xl">
            <Link href="/today">
              <Stethoscope className="h-4 w-4" />
              Open OPS board
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
