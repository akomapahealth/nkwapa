'use client';

import { useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, CircleCheck, FileUp, UserCheck } from 'lucide-react';
import { formatStaffDisplayName } from '@nkwapa/db/staff-name';
import { ApiError, getErrorMessage, type GetToken } from '@/lib/api';
import {
  ADDRESS_IN_USE_CODE,
  createStaffInvite,
  formatStaffRole,
  type StaffInviteRole,
} from '@/lib/staff-invite';
import {
  MAX_IMPORT_BYTES,
  duplicateEmails,
  inviteRowProblem,
  parseInviteCsv,
  splitFullName,
  type InviteImportRow,
} from '@/lib/staff-invite-import';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineNotice } from '@/components/ops/OpsShared';
import { cn } from '@/lib/utils';

type SendState =
  | { status: 'sent' }
  | { status: 'failed'; message: string }
  /** The address already has a Nkwapa account; sent again only once the director confirms. */
  | { status: 'account'; message: string };

interface BulkInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  getToken: GetToken | undefined;
  invitableRoles: StaffInviteRole[];
  memberEmails: ReadonlySet<string>;
  openInviteEmails: ReadonlySet<string>;
  /** After at least one invitation went out, so the list can refresh. */
  onSent: () => void;
}

const ROW_GRID =
  'grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 compact:grid-cols-[2.75rem_minmax(0,1.1fr)_minmax(0,1.3fr)_9.5rem_minmax(8rem,0.8fr)]';

function fullName(row: InviteImportRow): string {
  return row.firstName && row.lastName
    ? formatStaffDisplayName({
        firstName: row.firstName,
        middleName: row.middleName || null,
        lastName: row.lastName,
      })
    : [row.firstName, row.lastName].filter(Boolean).join(' ');
}

/**
 * Invite many colleagues from a spreadsheet export (#383): pick a file, check and fix the rows,
 * then send. The file is read here and never uploaded; each row goes out through the same
 * endpoint and checks as a single invitation, one at a time, so one refusal never stops the rest.
 */
export function BulkInviteDialog({
  open,
  onOpenChange,
  clinicId,
  getToken,
  invitableRoles,
  memberEmails,
  openInviteEmails,
  onSent,
}: BulkInviteDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [rows, setRows] = useState<InviteImportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<Record<string, SendState>>({});
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const stopRef = useRef(false);

  const reset = () => {
    setFileName(null);
    setFileError(null);
    setRows([]);
    setSelected(new Set());
    setResults({});
    setProgress({ done: 0, total: 0 });
  };

  const context = useMemo(
    () => ({ memberEmails, openInviteEmails, invitableRoles }),
    [memberEmails, openInviteEmails, invitableRoles],
  );
  const duplicates = useMemo(() => duplicateEmails(rows), [rows]);
  const problems = useMemo(
    () =>
      Object.fromEntries(rows.map((row) => [row.key, inviteRowProblem(row, duplicates, context)])),
    [rows, duplicates, context],
  );

  const pending = rows.filter((row) => results[row.key]?.status !== 'sent');
  const chosen = pending.filter((row) => selected.has(row.key));
  const blocked = chosen.filter((row) => problems[row.key]);
  const sentCount = rows.filter((row) => results[row.key]?.status === 'sent').length;
  const failed = rows.filter((row) => results[row.key]?.status === 'failed');
  const accounts = rows.filter((row) => results[row.key]?.status === 'account');
  const allChosen = pending.length > 0 && chosen.length === pending.length;

  const readFile = async (file: File) => {
    setFileError(null);
    if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') {
      setFileError('Choose a .csv file. In Google Sheets or Excel, use Download as CSV.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setFileError('This file is over 1 MB. Split it and import each part.');
      return;
    }
    const parsed = parseInviteCsv(await file.text());
    if (!parsed.ok) {
      setFileError(parsed.error);
      return;
    }
    setFileName(file.name);
    setRows(parsed.rows);
    setResults({});
    // Rows with a fixable gap (no role yet) start ticked; rows the API would refuse do not.
    setSelected(
      new Set(
        parsed.rows
          .filter((row) => {
            const problem = inviteRowProblem(row, duplicateEmails(parsed.rows), context);
            return !problem || problem === 'Choose a role';
          })
          .map((row) => row.key),
      ),
    );
  };

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const update = (key: string, patch: Partial<InviteImportRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const toggle = (key: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const setRoleForChosen = (role: StaffInviteRole) =>
    setRows((current) =>
      current.map((row) => (selected.has(row.key) && !results[row.key] ? { ...row, role } : row)),
    );

  const send = async (batch: InviteImportRow[], confirmExistingAccount = false) => {
    if (!getToken || batch.length === 0) return;
    stopRef.current = false;
    setSending(true);
    setProgress({ done: 0, total: batch.length });
    let anySent = false;
    for (const [index, row] of batch.entries()) {
      if (stopRef.current) break;
      let state: SendState;
      try {
        const names = row.firstName && row.lastName;
        await createStaffInvite(clinicId, getToken, {
          email: row.email.trim().toLowerCase(),
          role: row.role,
          ...(names
            ? {
                firstName: row.firstName,
                ...(row.middleName ? { middleName: row.middleName } : {}),
                lastName: row.lastName,
              }
            : {}),
          ...(confirmExistingAccount ? { confirmExistingAccount: true } : {}),
        });
        state = { status: 'sent' };
        anySent = true;
      } catch (error) {
        state =
          error instanceof ApiError && error.code === ADDRESS_IN_USE_CODE
            ? { status: 'account', message: 'Has an account' }
            : { status: 'failed', message: getErrorMessage(error, 'Not sent') };
      }
      setResults((current) => ({ ...current, [row.key]: state }));
      setProgress({ done: index + 1, total: batch.length });
    }
    setSending(false);
    setSelected(new Set());
    if (anySent) onSent();
  };

  const stage = rows.length === 0 ? 'pick' : sending ? 'sending' : 'review';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-send would hide which rows went out.
        if (sending) return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent variant="form" className="compact:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Import invitations</DialogTitle>
          <DialogDescription>
            {stage === 'pick'
              ? 'A CSV with name and email columns. Other columns are ignored.'
              : `${fileName ?? 'File'} · ${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
          </DialogDescription>
        </DialogHeader>

        {stage === 'pick' ? (
          <div className="space-y-3">
            <label
              htmlFor="bulk-invite-file"
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center transition-colors duration-150',
                'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
              )}
            >
              <FileUp className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">Choose a CSV file</span>
              <span className="text-xs text-muted-foreground">or drop it here</span>
              <input
                id="bulk-invite-file"
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void readFile(file);
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">
              Read on this device. Nothing is sent until you review it.
            </p>
            {fileError ? <InlineNotice tone="error">{fileError}</InlineNotice> : null}
          </div>
        ) : (
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-sm tabular-nums text-muted-foreground" aria-live="polite">
                {sending
                  ? `Sending ${progress.done} of ${progress.total}…`
                  : sentCount > 0
                    ? `${sentCount} sent${failed.length ? ` · ${failed.length} failed` : ''}${
                        accounts.length ? ` · ${accounts.length} have accounts` : ''
                      }`
                    : `${chosen.length} selected${blocked.length ? ` · ${blocked.length} need attention` : ''}`}
              </p>
              {!sending && pending.length > 0 ? (
                <div className="ml-auto flex items-center gap-2">
                  <span id="bulk-role-label" className="text-sm text-muted-foreground">
                    Role for selected
                  </span>
                  <Select onValueChange={setRoleForChosen} disabled={chosen.length === 0}>
                    <SelectTrigger aria-labelledby="bulk-role-label" className="w-36">
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {invitableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {formatStaffRole(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {sending || progress.total > 0 ? (
              <div
                role="progressbar"
                aria-label="Invitations sent"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
                className="h-1 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full origin-left bg-primary transition-transform duration-200 ease-out motion-reduce:transition-none"
                  style={{
                    transform: `scaleX(${progress.total ? progress.done / progress.total : 0})`,
                  }}
                />
              </div>
            ) : null}

            <div
              role="table"
              aria-label="Rows to invite"
              className="rounded-lg border border-border compact:max-h-[55dvh] compact:overflow-y-auto"
            >
              <div
                role="row"
                className={cn(
                  ROW_GRID,
                  'sticky top-0 z-[1] hidden border-b border-border bg-background px-2 py-2 text-xs font-medium text-muted-foreground compact:grid',
                )}
              >
                <span role="columnheader" className="flex justify-center">
                  <Checkbox
                    aria-label="Select all rows"
                    checked={allChosen}
                    disabled={sending || pending.length === 0}
                    onCheckedChange={(on) =>
                      setSelected(on ? new Set(pending.map((row) => row.key)) : new Set())
                    }
                  />
                </span>
                <span role="columnheader">Name</span>
                <span role="columnheader">Email</span>
                <span role="columnheader">Role</span>
                <span role="columnheader">Status</span>
              </div>
              {rows.map((row) => {
                const result = results[row.key];
                const locked = sending || result?.status === 'sent';
                const problem = problems[row.key];
                return (
                  <div
                    key={row.key}
                    role="row"
                    aria-label={`Row ${row.line}`}
                    className={cn(
                      ROW_GRID,
                      'border-b border-border px-2 py-2 last:border-b-0',
                      result?.status === 'sent' && 'bg-muted/30',
                    )}
                  >
                    <div
                      role="cell"
                      className="row-span-4 flex h-11 w-11 items-center justify-center self-start compact:row-span-1 compact:self-center"
                    >
                      <Checkbox
                        className="before:absolute before:-inset-3.5 before:content-[''] relative"
                        aria-label={`Include row ${row.line}`}
                        checked={selected.has(row.key)}
                        disabled={locked}
                        onCheckedChange={(on) => toggle(row.key, on === true)}
                      />
                    </div>
                    <div role="cell">
                      <NameInput
                        label={`Name, row ${row.line}`}
                        row={row}
                        disabled={locked}
                        onCommit={(value) => update(row.key, splitFullName(value))}
                      />
                    </div>
                    <div role="cell">
                      <Input
                        aria-label={`Email, row ${row.line}`}
                        type="email"
                        autoComplete="off"
                        value={row.email}
                        disabled={locked}
                        onChange={(event) => update(row.key, { email: event.target.value })}
                      />
                    </div>
                    <div role="cell">
                      <Select
                        value={row.role || undefined}
                        disabled={locked}
                        onValueChange={(role) => update(row.key, { role })}
                      >
                        <SelectTrigger aria-label={`Role, row ${row.line}`}>
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {invitableRoles.map((role) => (
                            <SelectItem key={role} value={role}>
                              {formatStaffRole(role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div role="cell" className="text-sm">
                      <RowStatus result={result} problem={problem} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          {stage === 'pick' ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          ) : sending ? (
            <Button variant="outline" onClick={() => (stopRef.current = true)}>
              Stop after this one
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={reset}>
                Choose another file
              </Button>
              {accounts.length > 0 ? (
                <Button variant="outline" onClick={() => void send(accounts, true)}>
                  <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  Invite {accounts.length} existing {accounts.length === 1 ? 'account' : 'accounts'}
                </Button>
              ) : null}
              {failed.length > 0 && chosen.length === 0 ? (
                <Button variant="outline" onClick={() => void send(failed)}>
                  Retry {failed.length} failed
                </Button>
              ) : null}
              {pending.length === 0 || (chosen.length === 0 && sentCount > 0) ? (
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              ) : (
                <Button
                  onClick={() => void send(chosen)}
                  disabled={chosen.length === 0 || blocked.length > 0 || !getToken}
                >
                  Send {chosen.length} {chosen.length === 1 ? 'invitation' : 'invitations'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowStatus({ result, problem }: { result?: SendState; problem: string | null }) {
  if (result?.status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1.5 text-success-ink">
        <CircleCheck className="h-4 w-4" aria-hidden="true" />
        Sent
      </span>
    );
  }
  if (result) {
    return (
      <span className="inline-flex items-start gap-1.5 text-warning-ink" title={result.message}>
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="line-clamp-2">{result.message}</span>
      </span>
    );
  }
  if (problem) {
    return (
      <span className="inline-flex items-center gap-1.5 text-warning-ink">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        {problem}
      </span>
    );
  }
  return <span className="inline-flex items-center gap-1.5 text-muted-foreground">Ready</span>;
}

/** Edited as one string and split into first, middle and last on blur, so spaces can be typed. */
function NameInput({
  label,
  row,
  disabled,
  onCommit,
}: {
  label: string;
  row: InviteImportRow;
  disabled: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      aria-label={label}
      value={draft ?? fullName(row)}
      placeholder="Name (optional)"
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null) onCommit(draft);
        setDraft(null);
      }}
    />
  );
}
