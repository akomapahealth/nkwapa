'use client';

import { ExternalLink, Home, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  RecordSection as Card,
  RecordSectionContent as CardContent,
  RecordSectionHeader as CardHeader,
} from '@/components/patients/RecordSection';
import { EmptyState } from '@/components/feedback/AppState';
import {
  describePositionCapture,
  describeResidentialLocation,
  formatPosition,
  googleMapsUrl,
  type PatientLocationFields,
} from '@/lib/residential-location';

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
 * mistaken for the care site. It renders only on the staff chart, for roles that can read the
 * patient; the portal never receives these fields.
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
              <Tile
                label="Ghana Digital Address"
                value={location.digitalAddress ?? 'Not recorded'}
              />
              <Tile label="Nearest landmark" value={location.landmark ?? 'Not recorded'} />
              {location.addressNote ? (
                <div className="border-b border-rule py-3 sm:col-span-2">
                  <p className="type-label font-normal text-muted-foreground">Address note</p>
                  <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                    {location.addressNote}
                  </p>
                </div>
              ) : null}
            </div>
            {location.position ? (
              <div className="flex flex-col gap-3 border-b border-rule py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="type-label font-normal text-muted-foreground">Map position</p>
                  <p className="mt-1 text-sm tabular-nums text-foreground">
                    {formatPosition(location.position)}
                  </p>
                  <p className="text-sm leading-5 text-muted-foreground">
                    {describePositionCapture(location.position)}
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  className="h-auto max-w-full self-start whitespace-normal sm:self-center"
                >
                  <a
                    href={googleMapsUrl(location.position)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Open in Google Maps
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              </div>
            ) : null}
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
