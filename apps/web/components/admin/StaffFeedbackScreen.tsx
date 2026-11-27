'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, MessageSquareWarning, WifiOff } from 'lucide-react';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import {
  EmptyState,
  InlineErrorState,
  SectionSkeleton,
  SelectClinicState,
} from '@/components/feedback/AppState';
import { StaleDataNotice } from '@/components/feedback/StaleDataNotice';
import { RecordSection, RecordSectionContent } from '@/components/patients/RecordSection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSync } from '@/app/ServiceWorkerAndSyncProvider';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBootstrap } from '@/lib/bootstrap-context';
import { downloadCsv } from '@/lib/csv';
import { formatOpsDateTime } from '@/lib/ops';
import {
  STAFF_FEEDBACK_CATEGORIES,
  STATION_KIND_LABELS,
  listStaffFeedback,
  staffFeedbackCategoryLabel,
  staffFeedbackCsvRows,
  type StaffFeedbackRow,
} from '@/lib/staff-feedback';

const ALL = 'ALL';
const NO_STATION = 'NONE';

/** What staff reported with "Report a problem" (#422), newest first, for triage. */
export function StaffFeedbackScreen() {
  const getToken = useAuth();
  const { isOnline } = useSync();
  const clinicId = useBootstrap()?.activeClinicId ?? null;
  const [rows, setRows] = useState<StaffFeedbackRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(ALL);
  const [station, setStation] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    if (!getToken || !clinicId) return;
    setError(null);
    try {
      setRows(await listStaffFeedback(clinicId, getToken));
    } catch (err) {
      setError(getErrorMessage(err, 'Problem reports could not be loaded.'));
    }
  }, [clinicId, getToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      (rows ?? []).filter((row) => {
        const day = row.createdAt.slice(0, 10);
        return (
          (category === ALL || row.category === category) &&
          (station === ALL || (row.stationKind ?? NO_STATION) === station) &&
          (!from || day >= from) &&
          (!to || day <= to)
        );
      }),
    [rows, category, station, from, to],
  );

  return (
    <div className="space-y-6">
      <AppPageHeader
        title="Problem reports"
        description="What staff reported from inside the app, with where it happened."
        hint="Reports may mention patients despite the warning on the form, so treat them as clinical data. They are deleted after 12 months."
        actions={
          <Button
            variant="outline"
            disabled={!visible.length}
            onClick={() =>
              downloadCsv(
                `problem-reports-${new Date().toISOString().slice(0, 10)}.csv`,
                staffFeedbackCsvRows(visible),
              )
            }
          >
            <Download aria-hidden="true" />
            Download CSV
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="feedback-category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="feedback-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {STAFF_FEEDBACK_CATEGORIES.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feedback-station">Station</Label>
          <Select value={station} onValueChange={setStation}>
            <SelectTrigger id="feedback-station">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All stations</SelectItem>
              {Object.entries(STATION_KIND_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
              <SelectItem value={NO_STATION}>Not at a station</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feedback-from">From</Label>
          <Input
            id="feedback-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="feedback-to">To</Label>
          <Input
            id="feedback-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(event) => setTo(event.target.value)}
          />
        </div>
      </div>

      {!isOnline ? <StaleDataNotice isOnline={false} /> : null}
      {!clinicId ? (
        <SelectClinicState surface="Problem reports" />
      ) : error ? (
        <InlineErrorState
          title="Problem reports could not be loaded"
          description={error}
          onRetry={() => void load()}
        />
      ) : rows === null ? (
        <SectionSkeleton lines={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          density="compact"
          titleAs="h2"
          icon={MessageSquareWarning}
          title={rows.length ? 'No reports match' : 'No problem reports yet'}
          description={
            rows.length
              ? 'Change the filters to see more.'
              : 'Staff report problems from their account menu or a station visit. They appear here.'
          }
        />
      ) : (
        <RecordSection>
          <RecordSectionContent className="p-0">
            <ul className="divide-y divide-border" aria-label="Problem reports">
              {visible.map((row) => (
                <li key={row.id} className="space-y-1.5 px-4 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">
                      {staffFeedbackCategoryLabel(row.category)}
                    </p>
                    {row.stationKind ? (
                      <Badge variant="secondary">
                        {STATION_KIND_LABELS[row.stationKind] ?? row.stationKind}
                      </Badge>
                    ) : null}
                    {row.context.online === false ? (
                      <Badge variant="outline" className="gap-1">
                        <WifiOff aria-hidden="true" className="h-3 w-3" />
                        Offline
                      </Badge>
                    ) : null}
                  </div>
                  {row.text ? (
                    <p className="whitespace-pre-line text-sm leading-6 text-foreground">
                      &ldquo;{row.text}&rdquo;
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {formatOpsDateTime(row.createdAt)} · {row.reporter.displayName}
                    {row.context.role ? ` (${row.context.role})` : ''} ·{' '}
                    <span className="font-mono">{row.context.route ?? '—'}</span>
                    {row.context.version ? ` · version ${row.context.version}` : ''}
                    {row.context.outboxSize ? ` · ${row.context.outboxSize} waiting to sync` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </RecordSectionContent>
        </RecordSection>
      )}
    </div>
  );
}
