'use client';

import { Home, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionHeader as CardHeader,
} from '@/components/patients/RecordSection';
import { EmptyState } from '@/components/feedback/AppState';
import { describeResidentialLocation } from '@/lib/residential-location';
import type { GhanaRegion, PatientLocationStatus } from '@/lib/residential-location';

interface PatientLocationFields {
  residentialLocationStatus?: PatientLocationStatus | string | null;
  residentialRegion?: GhanaRegion | string | null;
  residentialDistrict?: string | null;
  residentialCommunity?: string | null;
  residentialAddressNote?: string | null;
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-rule py-3">
      <p className="type-label font-normal text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

/**
 * Read-only residential location for the patient detail Overview. Deliberately
 * labelled and styled apart from the primary clinic so residence is never
 * mistaken for the care site.
 */
export function ResidentialLocationSummary({ patient }: { patient: PatientLocationFields }) {
  const location = describeResidentialLocation(patient);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="type-section-title">Residential location</h2>
          </div>
          <Badge variant={'outline'}>{location.statusLabel}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Where the patient lives, separate from their primary clinic.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {location.isRecorded ? (
          <>
            <div className="flex items-start gap-2 border-b border-rule py-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">{location.summary}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Tile label="Region" value={location.regionLabel ?? 'Not recorded'} />
              <Tile label="District" value={location.district ?? 'Not recorded'} />
              <Tile label="Community" value={location.community ?? 'Not recorded'} />
              {location.addressNote ? (
                <div className="border-b border-rule py-3 sm:col-span-2">
                  <p className="type-label font-normal text-muted-foreground">Address note</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                    {location.addressNote}
                  </p>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <EmptyState
            density="compact"
            icon={MapPin}
            title={
              location.status === 'UNKNOWN' ? 'Location not known' : 'No location recorded yet'
            }
            description={
              location.status === 'UNKNOWN'
                ? 'The patient was asked and their residential location is not known.'
                : 'No residential location has been recorded yet. Edit the patient to add one.'
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
