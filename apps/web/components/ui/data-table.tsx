'use client';

import {
  columnFilteringFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFns,
  flexRender,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
  type CellData,
  type Column,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type SortingState,
  type TableFeatures,
  type Updater,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/*
  Column options this table reads. Declared on table-core, which owns `ColumnMeta`; the React
  adapter only re-exports it. The type parameters must match the original declaration to merge.
*/
/* eslint-disable @typescript-eslint/no-unused-vars */
declare module '@tanstack/table-core' {
  interface ColumnMeta<
    TFeatures extends TableFeatures,
    TData extends RowData,
    TValue extends CellData = CellData,
  > {
    /** Right-align numbers and actions so they line up down the column. */
    align?: 'left' | 'right';
    /** Classes for both the header and the body cell, e.g. a fixed width. */
    className?: string;
    /** Hide below `md`; the mobile card carries this column instead. */
    hideOnMobile?: boolean;
  }
}
/* eslint-enable @typescript-eslint/no-unused-vars */

/*
  The features every table gets, declared once at module scope: v9 rebuilds row models when this
  object changes identity, so it must never be created during render.
*/
const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns,
  filterFns,
});

export type DataTableFeatures = typeof dataTableFeatures;
/** A column for `DataTable`. `TValue` is left open so accessor columns of any type mix freely. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;

/**
 * The one data table.
 *
 * Headless TanStack Table drawn with the app's own tokens, replacing MUI DataGrid. Rows are 44px
 * on desktop and 52px on touch (MASTER.md section 8), numerals are tabular, the header sticks
 * inside its scroll container, and a refresh shows the 2px bar rather than blanking rows
 * (section 11).
 *
 * Two modes, picked by what you pass:
 *  - Client: hand it every row. It sorts, filters (`globalFilter`) and pages them itself.
 *  - Server: pass `rowCount` with controlled `sorting` / `pagination`. It asks; you fetch.
 *
 * Below `md` the table becomes `renderMobileRow` cards when given one: a twelve-column grid does
 * not read on a phone, and every screen used to hand-roll that list beside its grid.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  caption,
  rowCount,
  sorting: controlledSorting,
  onSortingChange,
  pagination: controlledPagination,
  onPaginationChange,
  pageSizeOptions = [10, 25, 50],
  initialPageSize = 10,
  globalFilter,
  isRefreshing = false,
  emptyState,
  renderMobileRow,
  maxHeight = 560,
  className,
}: {
  columns: DataTableColumn<TData>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  /** Read to screen readers before the table: what these rows are. */
  caption: string;
  /** Server mode: the total across every page. */
  rowCount?: number;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  /** Client mode: free-text filter across every column. */
  globalFilter?: string;
  isRefreshing?: boolean;
  /** Shown in place of the rows when there are none. */
  emptyState?: React.ReactNode;
  renderMobileRow?: (row: TData) => React.ReactNode;
  /** Height the body may grow to before it scrolls under the sticky header. */
  maxHeight?: number;
  className?: string;
}) {
  const serverMode = rowCount !== undefined;
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [localPagination, setLocalPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const sorting = controlledSorting ?? localSorting;
  const pagination = controlledPagination ?? localPagination;

  const resolve = <T,>(updater: Updater<T>, current: T): T =>
    typeof updater === 'function' ? (updater as (old: T) => T)(current) : updater;

  const table = useTable({
    features: dataTableFeatures,
    data,
    columns,
    getRowId,
    state: { sorting, pagination, globalFilter: globalFilter ?? '' },
    manualSorting: serverMode,
    manualPagination: serverMode,
    manualFiltering: serverMode,
    rowCount,
    globalFilterFn: 'includesString',
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = resolve(updater, sorting);
      if (onSortingChange) onSortingChange(next);
      else setLocalSorting(next);
    },
    onPaginationChange: (updater: Updater<PaginationState>) => {
      const next = resolve(updater, pagination);
      if (onPaginationChange) onPaginationChange(next);
      else setLocalPagination(next);
    },
    // Ascending, descending, then back to the default order on a third click.
    enableSortingRemoval: true,
  });

  const rows = table.getRowModel().rows;
  const total = serverMode ? (rowCount ?? 0) : table.getFilteredRowModel().rows.length;
  const first = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const last = Math.min(total, (pagination.pageIndex + 1) * pagination.pageSize);

  return (
    <div className={cn('space-y-3', className)}>
      {renderMobileRow ? (
        <div className="space-y-3 md:hidden">
          {rows.length === 0
            ? emptyState
            : rows.map((row) => <div key={row.id}>{renderMobileRow(row.original)}</div>)}
        </div>
      ) : null}

      <div
        className={cn(
          'relative overflow-hidden rounded-lg border border-border bg-card',
          renderMobileRow && 'hidden md:block',
        )}
      >
        {/* Out of flow, so a refresh cannot move the rows beneath it (MASTER.md section 11). */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5 overflow-hidden transition-opacity duration-fast',
            isRefreshing ? 'opacity-100' : 'opacity-0',
          )}
        >
          <div className="h-full w-1/4 animate-refresh-sweep bg-primary" />
        </div>
        <div className="overflow-auto" style={{ maxHeight }}>
          <table className="w-full caption-bottom border-collapse text-sm tabular-nums">
            <caption className="sr-only">{caption}</caption>
            <thead className="sticky top-0 z-10 bg-muted">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id} className="border-b border-border">
                  {group.headers.map((header) => {
                    const meta = header.column.columnDef.meta;
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : header.column.getCanSort()
                                ? 'none'
                                : undefined
                        }
                        className={cn(
                          'h-11 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold text-foreground',
                          meta?.align === 'right' && 'text-right',
                          meta?.hideOnMobile && 'hidden md:table-cell',
                          meta?.className,
                        )}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <SortButton column={header.column} align={meta?.align}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </SortButton>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={table.getAllLeafColumns().length} className="p-0">
                    {emptyState ?? (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        Nothing to show.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-border/70 transition-colors duration-fast last:border-b-0 hover:bg-muted/50"
                  >
                    {row.getAllCells().map((cell) => {
                      const meta = cell.column.columnDef.meta;
                      return (
                        <td
                          key={cell.id}
                          className={cn(
                            'h-11 px-3 py-1.5 align-middle text-foreground [@media(pointer:coarse)]:h-[52px]',
                            meta?.align === 'right' && 'text-right',
                            meta?.hideOnMobile && 'hidden md:table-cell',
                            meta?.className,
                          )}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > 0 ? (
        <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="tabular-nums text-muted-foreground" aria-live="polite">
            {first}–{last} of {total}
          </p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="hidden text-muted-foreground sm:inline">Rows</span>
              <Select
                value={String(pagination.pageSize)}
                onValueChange={(value) =>
                  table.setPagination({ pageIndex: 0, pageSize: Number(value) })
                }
              >
                <SelectTrigger aria-label="Rows per page" className="h-11 w-[76px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Previous page"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Next page"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SortButton<TData extends RowData>({
  column,
  align,
  children,
}: {
  column: Column<DataTableFeatures, TData, unknown>;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={cn(
        // The header cell is the target; the visible control stays compact.
        '-mx-2 inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors duration-fast hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        align === 'right' && 'flex-row-reverse',
        sorted ? 'text-primary' : 'text-foreground',
      )}
    >
      {children}
      <Icon
        aria-hidden="true"
        className={cn('h-3.5 w-3.5 shrink-0', sorted ? 'opacity-100' : 'opacity-40')}
      />
    </button>
  );
}

/**
 * Row actions, right-aligned and the same width in every row so the buttons line up down the
 * column. One primary action at most; the rest outline.
 */
export function DataTableActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2">{children}</div>;
}
