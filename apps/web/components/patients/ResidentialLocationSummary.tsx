'use client';

import { Home, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
    <div className="rounded-3xl border border-border/80 bg-background/75 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm text-foreground">{value}</p>
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
    <Card className="rounded-[28px] border-border/80 bg-card/90 shadow-lg shadow-black/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Home className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">Residential location</h2>
          </div>
          <Badge variant={location.isRecorded ? 'default' : 'outline'}>
            {location.statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Where the patient lives — separate from their primary clinic.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {location.isRecorded ? (
          <>
            <div className="flex items-start gap-2 rounded-3xl border border-border/80 bg-background/75 p-4">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium text-foreground">{location.summary}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Tile label="Region" value={location.regionLabel ?? 'Not recorded'} />
              <Tile label="District" value={location.district ?? 'Not recorded'} />
              <Tile label="Community" value={location.community ?? 'Not recorded'} />
              {location.addressNote ? (
                <div className="rounded-3xl border border-border/80 bg-background/75 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Address note
                  </p>
                  <p className="mt-2 whitespace-pre-line text-sm text-foreground">
                    {location.addressNote}
                  </p>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-border/80 bg-background/60 p-4 text-sm text-muted-foreground">
            {location.status === 'UNKNOWN'
              ? 'The patient was asked and their residential location is not known.'
              : 'No residential location has been recorded yet. Edit the patient to add one.'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
