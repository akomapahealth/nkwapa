import type { SxProps, Theme } from "@mui/material";

export const dataGridSx: SxProps<Theme> = {
  border: "1px solid hsl(var(--border))",
  borderRadius: "var(--radius)",
  fontFamily: "var(--font-body), system-ui, sans-serif",
  "& .MuiDataGrid-columnHeaders": {
    backgroundColor: "hsl(var(--muted))",
    borderBottom: "1px solid hsl(var(--border))",
  },
  "& .MuiDataGrid-columnHeaderTitle": {
    fontWeight: 600,
    color: "hsl(var(--foreground))",
  },
  "& .MuiDataGrid-cell": {
    borderColor: "hsl(var(--border))",
    color: "hsl(var(--foreground))",
  },
  "& .MuiDataGrid-row:hover": {
    backgroundColor: "hsl(var(--accent))",
  },
  "& .MuiDataGrid-footerContainer": {
    borderColor: "hsl(var(--border))",
  },
  "& .MuiTablePagination-root": {
    color: "hsl(var(--muted-foreground))",
  },
  "@media (max-width: 768px)": {
    "--DataGrid-rowHeight": "52px",
  },
};
