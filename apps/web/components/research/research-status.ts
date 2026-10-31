import type { ResearchExportStatus } from '@/lib/research';

/*
  Seven export states across four semantic tokens.

  Approved and Processing deliberately share --info: they are both "accepted, not finished", and
  inventing another hue to separate two adjacent waiting states is what once produced a six-colour
  palette here. Skipped is a governance outcome, not an error, so it reads as a warning: someone
  should look, nothing broke. The words differ, and the words are what the reader acts on.
*/
export const EXPORT_STATUS_STYLES: Record<ResearchExportStatus, string> = {
  PENDING_APPROVAL: 'border-warning/25 bg-warning/10 text-warning-ink',
  APPROVED: 'border-info/25 bg-info/10 text-info-ink',
  PROCESSING: 'border-info/25 bg-info/10 text-info-ink',
  COMPLETED: 'border-success/25 bg-success/10 text-success-ink',
  FAILED: 'border-destructive/25 bg-destructive/10 text-destructive-ink',
  REJECTED: 'border-border bg-muted text-muted-foreground',
  SKIPPED: 'border-warning/25 bg-warning/10 text-warning-ink',
};
