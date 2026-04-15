import type { SxProps, Theme } from '@mui/material';

export const dataGridSx: SxProps<Theme> = {
  border: '1px solid hsl(var(--border) / 0.85)',
  borderRadius: '24px',
  backgroundColor: 'hsl(var(--card) / 0.92)',
  boxShadow: '0 10px 30px hsl(var(--foreground) / 0.04)',
  overflow: 'hidden',
  fontFamily: 'var(--font-body), system-ui, sans-serif',
  '& .MuiDataGrid-columnHeaders': {
    backgroundColor: 'hsl(var(--muted) / 0.7)',
    borderBottom: '1px solid hsl(var(--border) / 0.9)',
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
    borderColor: 'hsl(var(--border) / 0.7)',
    color: 'hsl(var(--foreground))',
    alignItems: 'center',
  },
  '& .MuiDataGrid-row': {
    transition: 'background-color 160ms ease, transform 160ms ease',
  },
  '& .MuiDataGrid-row:hover': {
    backgroundColor: 'hsl(var(--accent) / 0.6)',
  },
  '& .MuiDataGrid-footerContainer': {
    borderColor: 'hsl(var(--border) / 0.85)',
    backgroundColor: 'hsl(var(--background) / 0.75)',
  },
  '& .MuiTablePagination-root': {
    color: 'hsl(var(--muted-foreground))',
  },
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
