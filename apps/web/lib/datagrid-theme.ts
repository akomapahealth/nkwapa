import type { SxProps, Theme } from '@mui/material';

/**
 * The one MUI DataGrid treatment.
 *
 * Twelve call sites share this object, so it is the cheapest place in the product to hold the
 * table half of the design contract (docs/design-system/MASTER.md sections 5, 7 and 8). Three
 * things it deliberately does NOT do, each of which it used to:
 *
 *  - No `borderRadius: 24px`. The scale caps at 14px; a grid is a panel, so it takes `--radius`.
 *  - No drop shadow. Decorative elevation is off-contract on a clinical view; the border and the
 *    card/canvas surface pair carry the separation instead.
 *  - No `transform` in the row transition. Transform-based hover moves content under a user
 *    mid-entry, which section 7 forbids outright. Colour alone signals the hover.
 *
 * Sticky column headers are new: a clinic roster or patient registry routinely runs past a
 * viewport, and losing the header on scroll is what forces staff to count columns.
 */
export const dataGridSx: SxProps<Theme> = {
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  backgroundColor: 'hsl(var(--card))',
  overflow: 'hidden',
  fontFamily: 'var(--font-body), system-ui, sans-serif',
  color: 'hsl(var(--foreground))',
  /*
    MUI X v8 paints the header and pinned surfaces from its own CSS variables, which default to
    the MUI theme's paper colour -- and the MUI theme here is the default light one. Styling
    `.MuiDataGrid-columnHeaders` alone therefore left white underneath: in dark mode the header
    label resolved to `--foreground` (near-white) on that white, measuring 1.16:1. Every data grid
    in the product had unreadable column headers in dark mode, which is precisely the defect a
    per-group dark pass was meant to catch and #82 recorded as never having happened.
  */
  '--DataGrid-containerBackground': 'hsl(var(--muted))',
  '--DataGrid-pinnedBackground': 'hsl(var(--card))',
  '& .MuiDataGrid-columnHeaders, & .MuiDataGrid-columnHeader': {
    backgroundColor: 'hsl(var(--muted))',
    borderBottom: '1px solid hsl(var(--border))',
  },
  '& .MuiDataGrid-columnHeaders': {
    position: 'sticky',
    top: 0,
    zIndex: 2,
  },
  '& .MuiDataGrid-columnHeaderTitle': {
    fontWeight: 600,
    color: 'hsl(var(--foreground))',
  },
  '& .MuiDataGrid-columnHeader, & .MuiDataGrid-cell': {
    paddingLeft: '0.5rem',
    paddingRight: '0.5rem',
  },
  '& .MuiDataGrid-cell': {
    borderColor: 'hsl(var(--border))',
    color: 'hsl(var(--foreground))',
    alignItems: 'center',
  },
  // Clinical values have to align down a column to be comparable at a glance. Applied to the whole
  // grid rather than per-column because proportional digits never help in a table.
  '& .MuiDataGrid-cell, & .MuiTablePagination-root': {
    fontVariantNumeric: 'tabular-nums',
  },
  '& .MuiDataGrid-row': {
    transition: 'background-color 150ms ease',
  },
  '& .MuiDataGrid-row:hover': {
    backgroundColor: 'hsl(var(--accent))',
  },
  // Row selection has to stay distinguishable from hover, and both from the plain row.
  '& .MuiDataGrid-row.Mui-selected, & .MuiDataGrid-row.Mui-selected:hover': {
    backgroundColor: 'hsl(var(--accent))',
  },
  '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within':
    {
      outline: '2px solid hsl(var(--ring))',
      outlineOffset: '-2px',
    },
  '& .MuiDataGrid-footerContainer': {
    borderColor: 'hsl(var(--border))',
    backgroundColor: 'hsl(var(--background))',
  },
  '& .MuiTablePagination-root': {
    color: 'hsl(var(--muted-foreground))',
  },
  '& .MuiDataGrid-overlay': {
    backgroundColor: 'hsl(var(--card))',
    color: 'hsl(var(--muted-foreground))',
  },
  // 44px is the contract's desktop row height and its minimum interactive target; 52px is the
  // touch row, because a row here is a link into a patient record.
  '--DataGrid-rowHeight': '44px',
  '@media (max-width: 768px)': {
    '--DataGrid-rowHeight': '52px',
    '& .MuiDataGrid-columnHeaderTitle': {
      fontSize: '0.75rem',
    },
    '& .MuiDataGrid-columnHeader, & .MuiDataGrid-cell': {
      paddingLeft: '0.375rem',
      paddingRight: '0.375rem',
    },
    '& .MuiDataGrid-cell': {
      fontSize: '0.75rem',
    },
    '& .MuiTablePagination-root': {
      fontSize: '0.75rem',
    },
  },
};
