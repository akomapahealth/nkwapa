'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { STATION_KIND_LABELS } from '@nkwapa/db/clinic-stations';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { RouteGuard } from '@/components/RouteGuard';
import { StationGuideBody } from '@/components/stations/StationGuide';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap, useClinicUnits } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { GUIDED_STATION_KINDS, guideNextStation, stationGuideTitle } from '@/lib/station-guide';
import { fetchStations, type ClinicStation } from '@/lib/stations';

/**
 * Every station's how-to card on its own A5 page (#412): the hand-out for a practice session and
 * the sheet on each station's table. Print CSS only; the cards and the page size live in
 * globals.css under `.station-guide-card`.
 */
export default function StationGuidePrintPage() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const { glucoseUnit } = useClinicUnits();
  // Empty until loaded, or when the station list cannot be reached: the cards still print, only
  // without the clinic's station names and the "Next" line.
  const [stations, setStations] = useState<ClinicStation[]>([]);

  useEffect(() => {
    if (!clinicId || !getToken) return;
    let cancelled = false;
    fetchStations(clinicId, getToken)
      .then(({ items }) => {
        if (!cancelled) setStations(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [clinicId, getToken]);

  return (
    <RouteGuard requiredPermission="OPS.STATION.READ" requiresClinic>
      <div className="space-y-6">
        <div className="print:hidden">
          <AppPageHeader
            title="Station guide"
            description="One page per station. Print it for each station table, or as the practice hand-out."
            actions={
              <Button type="button" onClick={() => window.print()}>
                <Printer aria-hidden="true" />
                Print
              </Button>
            }
          />
        </div>
        <div className="grid gap-4 desktop:grid-cols-2 print:block">
          {GUIDED_STATION_KINDS.map((kind) => {
            const station = [...stations]
              .filter((candidate) => candidate.active && candidate.kind === kind)
              .sort((a, b) => a.sortOrder - b.sortOrder)[0];
            const name = station?.name ?? STATION_KIND_LABELS[kind];
            return (
              <article
                key={kind}
                data-station-kind={kind}
                aria-labelledby={`guide-${kind}`}
                className="station-guide-card rounded-lg border border-border p-5 print:rounded-none print:border-0 print:p-0"
              >
                <h2
                  id={`guide-${kind}`}
                  className="text-balance font-heading text-xl font-semibold tracking-tight print:text-[20pt]"
                >
                  {stationGuideTitle(name)}
                </h2>
                <StationGuideBody
                  kind={kind}
                  nextName={guideNextStation(stations, kind)?.name ?? null}
                  glucoseUnit={glucoseUnit}
                  className="mt-4 text-sm leading-6 print:text-[12pt] print:leading-normal"
                />
              </article>
            );
          })}
        </div>
      </div>
    </RouteGuard>
  );
}
