'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp } from 'lucide-react';
import { STATION_KIND_LABELS } from '@nkwapa/db/clinic-stations';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { isWebFeatureEnabled } from '@/lib/feature-flags';
import {
  createStation,
  fetchStations,
  moveStation,
  reorderStations,
  updateStation,
  type ClinicStation,
  type StationKind,
} from '@/lib/stations';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { InlineNotice } from '@/components/ops/OpsShared';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CAPACITY_MAX = 50;

type Draft = { name: string; capacity: string; active: boolean };

const draftOf = (station: ClinicStation): Draft => ({
  name: station.name,
  capacity: String(station.capacity ?? 1),
  active: station.active,
});

function capacityValue(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= CAPACITY_MAX ? value : null;
}

/**
 * Setting up the station line (#32): the order patients go through, each station's name, whether
 * it is open, and how many patients it can see at once -- chairs, cuffs, rooms. Capacity next to
 * the staff on a station is what tells a manager whether a queue is waiting for people or for
 * equipment.
 */
function StationSetupContent() {
  const getToken = useAuth();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap);
  const [stations, setStations] = useState<ClinicStation[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [newKind, setNewKind] = useState<StationKind>('CUSTOM');
  const [newName, setNewName] = useState('');
  const [newCapacity, setNewCapacity] = useState('1');

  const load = useCallback(async () => {
    if (!clinicId || !getToken) return;
    const { items } = await fetchStations(clinicId, getToken);
    const ordered = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    setStations(ordered);
    setDrafts(Object.fromEntries(ordered.map((station) => [station.id, draftOf(station)])));
  }, [clinicId, getToken]);

  useEffect(() => {
    load().catch((failure) =>
      setMessage({
        tone: 'error',
        text: failure instanceof Error ? failure.message : String(failure),
      }),
    );
  }, [load]);

  const run = async (key: string, action: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      await load();
      setMessage({ tone: 'success', text: done });
    } catch (failure) {
      setMessage({
        tone: 'error',
        text: failure instanceof Error ? failure.message : String(failure),
      });
    } finally {
      setBusy(null);
    }
  };

  if (!clinicId || !getToken) return null;
  if (!stations) return <SectionSkeleton lines={6} />;

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Clinic ops"
        title="Station setup"
        description="The order patients move through, and how many each station can see at once."
        helpTitle="What capacity means"
        helpText="How many patients a station can see at the same time: chairs, BP cuffs, consulting rooms. It is not how many staff are on it. When a station is full and patients still wait, the limit is equipment or space; when it has room and patients wait, the limit is staff."
        actions={
          <Button asChild variant="outline">
            <Link href="/today">
              <ArrowLeft aria-hidden="true" />
              Station line
            </Link>
          </Button>
        }
      />

      {message ? <InlineNotice tone={message.tone}>{message.text}</InlineNotice> : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Stations, in order</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="divide-y" data-testid="station-setup-list">
            {stations.map((station, index) => {
              const draft = drafts[station.id] ?? draftOf(station);
              const capacity = capacityValue(draft.capacity);
              const changed =
                draft.name.trim() !== station.name ||
                capacity !== (station.capacity ?? 1) ||
                draft.active !== station.active;
              const setDraft = (patch: Partial<Draft>) =>
                setDrafts((prev) => ({ ...prev, [station.id]: { ...draft, ...patch } }));
              return (
                <li
                  key={station.id}
                  className="grid gap-3 py-3 sm:grid-cols-[auto_1fr_8rem_auto_auto] sm:items-end"
                  data-testid="station-setup-row"
                >
                  <div className="flex items-center gap-1">
                    <span className="w-6 text-sm tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${station.name} earlier`}
                      disabled={index === 0 || busy !== null}
                      onClick={() =>
                        void run(
                          'order',
                          () =>
                            reorderStations(
                              clinicId,
                              moveStation(stations, station.id, -1),
                              getToken,
                            ),
                          'Order saved.',
                        )
                      }
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Move ${station.name} later`}
                      disabled={index === stations.length - 1 || busy !== null}
                      onClick={() =>
                        void run(
                          'order',
                          () =>
                            reorderStations(
                              clinicId,
                              moveStation(stations, station.id, 1),
                              getToken,
                            ),
                          'Order saved.',
                        )
                      }
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`station-name-${station.id}`}
                      className="flex items-center gap-2"
                    >
                      Name
                      <Badge variant="secondary">
                        {STATION_KIND_LABELS[station.kind] ?? station.kind}
                      </Badge>
                    </Label>
                    <Input
                      id={`station-name-${station.id}`}
                      value={draft.name}
                      maxLength={120}
                      onChange={(event) => setDraft({ name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`station-capacity-${station.id}`}>Sees at once</Label>
                    <Input
                      id={`station-capacity-${station.id}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={CAPACITY_MAX}
                      value={draft.capacity}
                      aria-invalid={capacity === null}
                      onChange={(event) => setDraft({ capacity: event.target.value })}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      id={`station-open-${station.id}`}
                      checked={draft.active}
                      onCheckedChange={(checked) => setDraft({ active: checked === true })}
                    />
                    <Label htmlFor={`station-open-${station.id}`}>Open</Label>
                  </div>
                  <Button
                    disabled={!changed || capacity === null || !draft.name.trim() || busy !== null}
                    onClick={() =>
                      void run(
                        station.id,
                        () =>
                          updateStation(
                            clinicId,
                            station.id,
                            {
                              ...(draft.name.trim() !== station.name
                                ? { name: draft.name.trim() }
                                : {}),
                              ...(capacity !== (station.capacity ?? 1)
                                ? { capacity: capacity! }
                                : {}),
                              ...(draft.active !== station.active ? { active: draft.active } : {}),
                            },
                            getToken,
                          ),
                        `${draft.name.trim()} saved.`,
                      )
                    }
                  >
                    {busy === station.id ? 'Saving…' : 'Save'}
                  </Button>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add a station</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-[12rem_1fr_8rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const capacity = capacityValue(newCapacity);
              if (!newName.trim() || capacity === null) return;
              void run(
                'create',
                async () => {
                  await createStation(
                    clinicId,
                    { kind: newKind, name: newName.trim(), capacity },
                    getToken,
                  );
                  setNewName('');
                  setNewCapacity('1');
                },
                'Station added at the end of the line.',
              );
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="new-station-kind">Kind</Label>
              <Select value={newKind} onValueChange={(value) => setNewKind(value as StationKind)}>
                <SelectTrigger id="new-station-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATION_KIND_LABELS) as StationKind[]).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {STATION_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-station-name">Name</Label>
              <Input
                id="new-station-name"
                value={newName}
                maxLength={120}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-station-capacity">Sees at once</Label>
              <Input
                id="new-station-capacity"
                type="number"
                inputMode="numeric"
                min={1}
                max={CAPACITY_MAX}
                value={newCapacity}
                onChange={(event) => setNewCapacity(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={!newName.trim() || capacityValue(newCapacity) === null || busy !== null}
            >
              {busy === 'create' ? 'Adding…' : 'Add station'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function StationSetupPage() {
  if (!isWebFeatureEnabled('stationWorkflow')) {
    return (
      <InlineNotice tone="info" live={false}>
        The station line is not turned on for this deployment.
      </InlineNotice>
    );
  }
  return (
    <RouteGuard
      requiredPermission="OPS.STATION.MANAGE"
      requiresClinic
      clinicSurface="Station setup"
    >
      <StationSetupContent />
    </RouteGuard>
  );
}
