import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type RecordRow = { id: string; name: string; count: number };
const records: RecordRow[] = [
  { id: 'c', name: 'Synthetic record C', count: 31 },
  { id: 'a', name: 'Synthetic record A with a deliberately long family name', count: 2 },
  { id: 'b', name: 'Synthetic record B', count: 14 },
  { id: 'd', name: 'Synthetic record D', count: 7 },
];

function Fixture() {
  const [server, setServer] = useState(false);
  const [cards, setCards] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [filter, setFilter] = useState('');
  const [action, setAction] = useState('none');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 2 });
  const [requests, setRequests] = useState(0);
  const open = (row: RecordRow) => setAction(row.id);
  const columns: DataTableColumn<RecordRow>[] = [
    { accessorKey: 'name', header: 'Record' },
    { accessorKey: 'count', header: 'Count', meta: { align: 'right' } },
    {
      id: 'actions',
      header: 'Actions',
      enableSorting: false,
      meta: { align: 'right' },
      cell: ({ row }) => (
        <Button variant="outline" onClick={() => open(row.original)}>
          Open {row.original.id}
        </Button>
      ),
    },
  ];
  const filtered = empty
    ? []
    : records.filter((row) => row.name.toLowerCase().includes(filter.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const sort = sorting[0];
    if (!sort) return 0;
    const comparison = sort.id === 'count' ? a.count - b.count : a.name.localeCompare(b.name);
    return sort.desc ? -comparison : comparison;
  });
  return (
    <div style={{ padding: 16, maxWidth: 1280, margin: 'auto' }}>
      <h1 className="type-page-title">Table surface verification</h1>
      <div className="flex flex-wrap gap-2 py-4">
        <Button onClick={() => setServer(!server)}>Toggle server</Button>
        <Button onClick={() => setCards(!cards)}>Toggle cards</Button>
        <Button onClick={() => setNarrow(!narrow)}>Toggle panel</Button>
        <Button onClick={() => setRefreshing(!refreshing)}>Toggle refresh</Button>
        <Button onClick={() => setEmpty(!empty)}>Toggle empty</Button>
      </div>
      <p role="status">
        Mode: {server ? 'server' : 'client'}; requests: {requests}; opened: {action}
      </p>
      <div data-testid="panel" style={{ width: narrow ? 560 : '100%', maxWidth: '100%' }}>
        <DataTable
          caption="Surface records"
          columns={columns}
          getRowId={(row) => row.id}
          data={
            server
              ? sorted.slice(
                  pagination.pageIndex * pagination.pageSize,
                  (pagination.pageIndex + 1) * pagination.pageSize,
                )
              : empty
                ? []
                : records
          }
          rowCount={server ? filtered.length : undefined}
          sorting={server ? sorting : undefined}
          onSortingChange={
            server
              ? (next) => {
                  setSorting(next);
                  setRequests((n) => n + 1);
                }
              : undefined
          }
          pagination={server ? pagination : undefined}
          onPaginationChange={
            server
              ? (next) => {
                  setPagination(next);
                  setRequests((n) => n + 1);
                }
              : undefined
          }
          initialPageSize={2}
          pageSizeOptions={[2, 4]}
          globalFilter={filter}
          isRefreshing={refreshing}
          maxHeight={180}
          toolbar={
            <Input
              aria-label="Filter surface records"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          }
          renderMobileRow={
            cards
              ? (row) => (
                  <article className="border-b border-border py-3">
                    <h2 className="type-label break-words">{row.name}</h2>
                    <p className="type-data">Count: {row.count}</p>
                    <Button variant="outline" onClick={() => open(row)}>
                      Open {row.id}
                    </Button>
                  </article>
                )
              : undefined
          }
        />
      </div>
    </div>
  );
}
const container = document.getElementById('component-fixture');
if (!container) throw new Error('Missing component fixture container');
createRoot(container).render(<Fixture />);
