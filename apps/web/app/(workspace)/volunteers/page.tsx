'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CalendarCheck, UserPlus } from 'lucide-react';
import { useBootstrap } from '@/lib/bootstrap-context';
import { getBootstrapActiveClinicId } from '@/lib/bootstrap-clinics';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, readApiError, ApiError } from '@/lib/api';
import { useAsyncResource } from '@/lib/use-async-resource';
import { volunteersPath, type VolunteerContact } from '@/lib/volunteers';
import { RouteGuard } from '@/components/RouteGuard';
import { AppPageHeader } from '@/components/app-shell/AppPageHeader';
import { ResourceState } from '@/components/feedback/ResourceState';
import { SectionSkeleton } from '@/components/feedback/AppState';
import { InlineNotice } from '@/components/feedback/InlineNotice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, DataTableActions, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldError, fieldErrorProps, focusFirstInvalid } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { showToast } from '@/components/ui/toast';

type FormState = { displayName: string; email: string; phoneE164: string; notes: string };
type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY_FORM: FormState = { displayName: '', email: '', phoneE164: '', notes: '' };
const FIELD_ORDER = ['volunteer-name', 'volunteer-email', 'volunteer-phone', 'volunteer-notes'];

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.displayName.trim()) errors.displayName = 'Enter their name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = 'Enter an email address, like name@example.com.';
  }
  if (form.phoneE164.trim() && !/^\+[1-9]\d{6,14}$/.test(form.phoneE164.trim())) {
    errors.phoneE164 = 'Use the international format, like +233201234567.';
  }
  return errors;
}

function VolunteersContent() {
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId = getBootstrapActiveClinicId(bootstrap) ?? '';
  const getToken = useAuth();

  const directory = useAsyncResource<{ items: VolunteerContact[] }>({
    resourceKey: clinicId,
    enabled: Boolean(clinicId),
    requiresOnline: true,
    errorMessage: 'The volunteer directory could not be loaded.',
    fetcher: async (token, signal) => {
      const response = await apiFetch(volunteersPath(clinicId), {
        getToken: token,
        activeClinicId: clinicId,
        signal,
      });
      if (!response.ok) throw await readApiError(response);
      return response.json();
    },
  });

  const [editing, setEditing] = useState<VolunteerContact | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const writable = directory.isOnline;

  const open = (target: VolunteerContact | 'new') => {
    setEditing(target);
    setForm(
      target === 'new'
        ? EMPTY_FORM
        : {
            displayName: target.displayName,
            email: target.email,
            phoneE164: target.phoneE164 ?? '',
            notes: target.notes ?? '',
          },
    );
    setErrors({});
    setSubmitted(false);
    setExistingId(null);
  };

  const write = async (path: string, method: string, body?: unknown) => {
    const response = await apiFetch(path, {
      method,
      getToken,
      activeClinicId: clinicId,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const details = await response
        .clone()
        .json()
        .then((payload: { details?: { existingId?: string } }) => payload.details ?? null)
        .catch(() => null);
      const error = await readApiError(response);
      setExistingId(details?.existingId ?? null);
      throw error;
    }
    return response.json();
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstInvalid(
        {
          'volunteer-name': found.displayName,
          'volunteer-email': found.email,
          'volunteer-phone': found.phoneE164,
        },
        FIELD_ORDER,
      );
      return;
    }
    setSaving(true);
    const body = {
      displayName: form.displayName.trim(),
      email: form.email.trim(),
      phoneE164: form.phoneE164.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editing === 'new') {
        await write(volunteersPath(clinicId), 'POST', body);
        showToast({ title: `${body.displayName} added`, tone: 'success' });
      } else if (editing) {
        await write(`${volunteersPath(clinicId)}/${editing.id}`, 'PATCH', body);
        showToast({ title: 'Volunteer updated', tone: 'success' });
      }
      setEditing(null);
      directory.refresh();
    } catch (error) {
      const api = error instanceof ApiError ? error : null;
      const fieldErrors: FormErrors = {};
      for (const entry of api?.fieldErrors ?? []) {
        if (
          entry.field === 'email' ||
          entry.field === 'displayName' ||
          entry.field === 'phoneE164'
        ) {
          fieldErrors[entry.field] = entry.message;
        }
      }
      if (api?.code === 'VOLUNTEER_EMAIL_EXISTS') {
        fieldErrors.email = 'Someone with this email is already in the directory.';
      }
      if (Object.keys(fieldErrors).length > 0) {
        setErrors(fieldErrors);
      } else {
        showToast({
          title: 'The volunteer could not be saved',
          description: error instanceof Error ? error.message : undefined,
          tone: 'error',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const act = async (contact: VolunteerContact, action: string, body?: unknown, done?: string) => {
    setBusyId(contact.id);
    try {
      await write(`${volunteersPath(clinicId)}/${contact.id}/${action}`, 'POST', body);
      if (done) showToast({ title: done, tone: 'success' });
      directory.refresh();
    } catch (error) {
      showToast({
        title: 'That did not work',
        description: error instanceof Error ? error.message : undefined,
        tone: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const items = directory.data?.items ?? [];
  const openExisting = () => {
    const existing = items.find((item) => item.id === existingId);
    if (existing) open(existing);
  };

  const accountCell = (contact: VolunteerContact) =>
    contact.linkedUser ? (
      <span className="text-sm">Linked to {contact.linkedUser.displayName}</span>
    ) : contact.linkCandidate ? (
      <span className="text-sm text-muted-foreground">
        Matches {contact.linkCandidate.displayName}
      </span>
    ) : (
      <span className="text-sm text-muted-foreground">No account</span>
    );

  const actions = (contact: VolunteerContact) => (
    <DataTableActions>
      <Button size="sm" variant="ghost" onClick={() => open(contact)} disabled={!writable}>
        Edit
      </Button>
      {contact.linkedUserId ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!writable || busyId === contact.id}
          onClick={() => act(contact, 'unlink', undefined, 'Account unlinked')}
        >
          Unlink
        </Button>
      ) : contact.linkCandidate ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={!writable || busyId === contact.id}
          onClick={() =>
            act(contact, 'link', { userId: contact.linkCandidate!.id }, 'Account linked')
          }
        >
          Link account
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        disabled={!writable || busyId === contact.id}
        onClick={() =>
          act(
            contact,
            contact.isActive ? 'deactivate' : 'reactivate',
            undefined,
            contact.isActive
              ? `${contact.displayName} deactivated`
              : `${contact.displayName} reactivated`,
          )
        }
      >
        {contact.isActive ? 'Deactivate' : 'Reactivate'}
      </Button>
    </DataTableActions>
  );

  const columns: DataTableColumn<VolunteerContact>[] = [
    {
      accessorKey: 'displayName',
      header: 'Name',
      cell: ({ row }) => (
        <span className="font-medium">
          {row.original.displayName}
          {!row.original.isActive ? (
            <Badge variant="draft" className="ml-2">
              Inactive
            </Badge>
          ) : null}
        </span>
      ),
    },
    { accessorKey: 'email', header: 'Email' },
    {
      accessorKey: 'phoneE164',
      header: 'Phone',
      cell: ({ row }) => row.original.phoneE164 ?? '—',
      meta: { hideOnMobile: true },
    },
    {
      id: 'account',
      header: 'Account',
      enableSorting: false,
      cell: ({ row }) => accountCell(row.original),
    },
    {
      id: 'actions',
      header: () => <span className="sr-only">Actions</span>,
      enableSorting: false,
      cell: ({ row }) => actions(row.original),
      meta: { align: 'right' },
    },
  ];

  return (
    <div className="space-y-6">
      <AppPageHeader
        eyebrow="Oversight"
        title="Volunteers"
        description="Who volunteers at this clinic. They don't need a Nkwapa account to be scheduled and emailed."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/volunteers/events">
                <CalendarCheck aria-hidden="true" />
                Screening days
              </Link>
            </Button>
            <Button onClick={() => open('new')} disabled={!writable}>
              <UserPlus aria-hidden="true" />
              Add volunteer
            </Button>
          </div>
        }
      />

      {!writable ? (
        <InlineNotice tone="warning">
          You are offline. The directory needs a connection to change.
        </InlineNotice>
      ) : null}

      <ResourceState
        state={directory}
        skeleton={<SectionSkeleton lines={6} />}
        errorTitle="The volunteer directory could not be loaded"
        isEmpty={(data) => data.items.length === 0}
        empty={{
          title: 'No volunteers yet',
          description: "Add their name and email; they don't need a Nkwapa account.",
          action: (
            <Button onClick={() => open('new')} disabled={!writable}>
              Add volunteer
            </Button>
          ),
        }}
      >
        {(data) => (
          <DataTable
            caption="Volunteer directory"
            columns={columns}
            data={data.items}
            getRowId={(row) => row.id}
            isRefreshing={directory.isRefreshing}
            initialPageSize={25}
            renderMobileRow={(contact) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{contact.displayName}</span>
                  {!contact.isActive ? <Badge variant="draft">Inactive</Badge> : null}
                </div>
                <p className="break-all text-sm text-muted-foreground">{contact.email}</p>
                {accountCell(contact)}
                {actions(contact)}
              </div>
            )}
          />
        )}
      </ResourceState>

      <Dialog open={editing !== null} onOpenChange={(next) => !next && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Add volunteer' : 'Edit volunteer'}</DialogTitle>
            <DialogDescription>
              Roster emails go to this address, whether or not they have an account.
            </DialogDescription>
          </DialogHeader>
          <form noValidate onSubmit={save} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="volunteer-name">Name</Label>
              <Input
                id="volunteer-name"
                value={form.displayName}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setForm({ ...form, displayName: event.target.value })}
                {...fieldErrorProps('volunteer-name', errors.displayName)}
              />
              <FieldError
                id="volunteer-name"
                message={errors.displayName}
                reserveSpace={submitted}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="volunteer-email">Email</Label>
              <Input
                id="volunteer-email"
                type="email"
                value={form.email}
                maxLength={320}
                autoComplete="off"
                onChange={(event) => {
                  setForm({ ...form, email: event.target.value });
                  setExistingId(null);
                }}
                {...fieldErrorProps('volunteer-email', errors.email)}
              />
              <FieldError id="volunteer-email" message={errors.email} reserveSpace={submitted} />
              {existingId ? (
                <Button type="button" variant="link" className="h-auto p-0" onClick={openExisting}>
                  Open existing
                </Button>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="volunteer-phone">Phone (optional)</Label>
              <Input
                id="volunteer-phone"
                type="tel"
                value={form.phoneE164}
                placeholder="+233201234567"
                maxLength={32}
                onChange={(event) => setForm({ ...form, phoneE164: event.target.value })}
                {...fieldErrorProps('volunteer-phone', errors.phoneE164)}
              />
              <FieldError
                id="volunteer-phone"
                message={errors.phoneE164}
                reserveSpace={submitted}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="volunteer-notes">Notes (optional)</Label>
              <Textarea
                id="volunteer-notes"
                value={form.notes}
                maxLength={500}
                aria-describedby="volunteer-notes-hint"
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
              />
              <p id="volunteer-notes-hint" className="text-sm text-muted-foreground">
                For you only. Never write anything about a patient here.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving || !writable}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function VolunteersPage() {
  return (
    <RouteGuard
      requiredPermission="VOLUNTEER.ROSTER.MANAGE"
      requiresClinic
      clinicSurface="The volunteer directory"
    >
      <VolunteersContent />
    </RouteGuard>
  );
}
