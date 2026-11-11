import Link from 'next/link';
import { StatusLabel } from '@/components/ui/status-label';
import type { DataTableColumn } from '@/components/ui/data-table';
import { formatOpsDateTime } from '@/lib/ops';

export interface RecentVisit {
  /** The encounter's id. */
  id: string;
  patientCode: string;
  patientName: string;
  status: string;
  createdAt: string;
}

/** The doctor's and reviewer's recent-visit tables: the same columns as Queues, each row a way back in. */
export const recentVisitColumns: DataTableColumn<RecentVisit>[] = [
  {
    id: 'patientName',
    accessorKey: 'patientName',
    header: 'Patient',
    cell: ({ row }) => (
      <Link
        href={`/encounters/${encodeURIComponent(row.original.id)}`}
        className="font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:text-primary hover:decoration-primary"
      >
        {row.original.patientName}
      </Link>
    ),
  },
  {
    id: 'patientCode',
    accessorKey: 'patientCode',
    header: 'Code',
    cell: ({ getValue }) => (
      <span className="font-mono text-xs" translate="no">
        {String(getValue())}
      </span>
    ),
  },
  {
    id: 'status',
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusLabel value={String(getValue())} />,
  },
  {
    id: 'createdAt',
    accessorKey: 'createdAt',
    header: 'Visit started',
    cell: ({ getValue }) => {
      const value = getValue() as string | null | undefined;
      return value ? (
        <time dateTime={value} className="tabular-nums">
          {formatOpsDateTime(value)}
        </time>
      ) : null;
    },
  },
];
