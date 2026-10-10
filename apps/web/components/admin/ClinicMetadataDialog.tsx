'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  FieldError,
  FieldLabel,
  RequiredLegend,
  fieldErrorProps,
  focusFirstInvalid,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InlineNotice } from '@/components/ops/OpsShared';
import { ApiError } from '@/lib/api';
import {
  CLINIC_FORM_FIELD_ORDER,
  LOCATION_CODE_MAX_LENGTH,
  matchesTimeZoneQuery,
  normalizeZoneCode,
  timeZoneOptions,
  toLocationCode,
  validateClinicForm,
  type ClinicFormErrors,
  type ClinicFormField,
  type ClinicFormValues,
  type OrganizationSummary,
} from '@/lib/clinic-metadata';

export type ClinicDialogMode = 'create' | 'edit';

interface ClinicMetadataDialogProps {
  open: boolean;
  mode: ClinicDialogMode;
  /** Initial values. A fresh object per open, so create and edit never share state. */
  initialValues: ClinicFormValues;
  organizations: OrganizationSummary[];
  /**
   * Zone codes already in use, offered as suggestions.
   *
   * Not a closed vocabulary: a zone comes into existence the first time a clinic is put in one,
   * so the field stays free text and these only make the existing spellings reachable.
   */
  knownZoneCodes?: string[];
  /** Focused once the dialog opens, so "fix this" from a badge lands on the right control. */
  focusField?: ClinicFormField;
  saving: boolean;
  /** The last failure from the server, so a 409 lands on the field it belongs to. */
  submitError: ApiError | Error | null;
  onSubmit: (values: ClinicFormValues) => void;
  onOpenChange: (open: boolean) => void;
}

/**
 * Create and edit a clinic's identity and location metadata.
 *
 * One dialog with its own state, rather than the two that shared a single set of form
 * variables -- opening edit and then create used to leak the edited clinic's values into the
 * new one.
 *
 * Validation runs on submit and then per field as each is corrected, per the form contract.
 * Server `fieldErrors` are merged into the same map, so a duplicate location code is reported
 * on the location code field rather than as a banner somewhere above the dialog.
 */
export function ClinicMetadataDialog({
  open,
  mode,
  initialValues,
  organizations,
  knownZoneCodes = [],
  focusField,
  saving,
  submitError,
  onSubmit,
  onOpenChange,
}: ClinicMetadataDialogProps) {
  const [values, setValues] = useState<ClinicFormValues>(initialValues);
  const [errors, setErrors] = useState<ClinicFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  /*
    Whether the operator has taken the location code over. Until they do, it tracks the name,
    which is what makes a required field feel like one keystroke rather than two. Editing an
    existing clinic never auto-follows: its code is already load-bearing for reporting, and
    renaming a clinic must not silently move it.
  */
  const [locationCodeTouched, setLocationCodeTouched] = useState(mode === 'edit');

  useEffect(() => {
    if (!open) return;
    setValues(initialValues);
    setErrors({});
    setSubmitted(false);
    setLocationCodeTouched(mode === 'edit');
    // initialValues is a fresh object per open; depending on it would reset mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  useEffect(() => {
    if (!open || !focusField) return;
    // After Radix has moved focus into the dialog, or it takes it straight back.
    const timer = window.setTimeout(() => {
      document.getElementById(`clinic-${focusField}`)?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open, focusField]);

  /** Server-reported field errors, keyed the same way the local ones are. */
  const serverFieldErrors = useMemo<ClinicFormErrors>(() => {
    if (!(submitError instanceof ApiError)) return {};
    const mapped: ClinicFormErrors = {};
    for (const { field, message } of submitError.fieldErrors) {
      const key = field.split('.').pop() as ClinicFormField;
      if (CLINIC_FORM_FIELD_ORDER.includes(key)) mapped[key] = message;
    }
    return mapped;
  }, [submitError]);

  const shownErrors: ClinicFormErrors = { ...serverFieldErrors, ...errors };

  const organization =
    organizations.find((entry) => entry.id === values.organizationId) ?? organizations[0] ?? null;
  // Named for time zones explicitly. "Zone" now means a reporting zone everywhere else in this
  // file, and two different things called zoneOptions in one component is a trap.
  const timeZonePickerOptions = useMemo(
    () => timeZoneOptions(organization?.timezone ?? null),
    [organization?.timezone],
  );

  const suggestedZoneCodes = useMemo(
    () =>
      [...new Set(knownZoneCodes.map((code) => normalizeZoneCode(code)))].filter(
        (code): code is string => code !== null,
      ),
    [knownZoneCodes],
  );

  // A zone code nobody else uses is not an error -- someone has to be first -- but it is worth
  // saying out loud, because the other way to arrive here is a typo, and a typo silently splits
  // one zone's report into two.
  const typedZoneCode = normalizeZoneCode(values.zoneCode);
  const isNewZoneCode =
    typedZoneCode !== null &&
    suggestedZoneCodes.length > 0 &&
    !suggestedZoneCodes.includes(typedZoneCode);

  const update = (patch: Partial<ClinicFormValues>) => {
    setValues((current) => {
      const next = { ...current, ...patch };
      if (patch.name !== undefined && !locationCodeTouched) {
        next.locationCode = toLocationCode(patch.name);
      }
      // Once the form has been submitted once, clear each field's error as it is corrected.
      if (submitted) setErrors(validateClinicForm(next));
      return next;
    });
  };

  const handleSubmit = () => {
    setSubmitted(true);
    const nextErrors = validateClinicForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstInvalid(
        Object.fromEntries(
          CLINIC_FORM_FIELD_ORDER.map((field) => [`clinic-${field}`, nextErrors[field]]),
        ),
        CLINIC_FORM_FIELD_ORDER.map((field) => `clinic-${field}`),
      );
      return;
    }
    onSubmit(values);
  };

  const derivedCode = toLocationCode(values.name || '');
  const canResetCode =
    mode === 'create' && locationCodeTouched && derivedCode !== values.locationCode && values.name;

  /* A form-level message only for what no single field can explain. */
  const formLevelError =
    submitError && Object.keys(serverFieldErrors).length === 0 ? submitError.message : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create clinic' : 'Edit clinic'}</DialogTitle>
          <DialogDescription>
            Location metadata drives organization reporting and zone filtering, so a clinic needs a
            time zone and a location code that is unique in its organization.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-6 py-2"
        >
          {formLevelError ? <InlineNotice tone="error">{formLevelError}</InlineNotice> : null}

          <fieldset className="space-y-4">
            <legend className="text-eyebrow text-muted-foreground">Identity</legend>

            <div className="space-y-2">
              <FieldLabel htmlFor="clinic-name" required>
                Name
              </FieldLabel>
              <Input
                id="clinic-name"
                required
                value={values.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Ridge Clinic"
                {...fieldErrorProps('clinic-name', shownErrors.name)}
              />
              <FieldError id="clinic-name" message={shownErrors.name} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clinic-region">Region</Label>
              <Input
                id="clinic-region"
                value={values.region}
                onChange={(event) => update({ region: event.target.value })}
                placeholder="Greater Accra"
                {...fieldErrorProps('clinic-region', shownErrors.region)}
              />
              <FieldError id="clinic-region" message={shownErrors.region} />
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-eyebrow text-muted-foreground">Location and zone</legend>

            {/*
              Organization is read-only once a clinic exists, and hidden entirely when there is
              only one to choose. Organization onboarding is deliberately out of scope.
            */}
            {mode === 'create' && organizations.length > 1 ? (
              <div className="space-y-2">
                <FieldLabel htmlFor="clinic-organizationId" required>
                  Organization
                </FieldLabel>
                <Select
                  value={values.organizationId}
                  onValueChange={(next) => update({ organizationId: next })}
                >
                  <SelectTrigger id="clinic-organizationId">
                    <SelectValue placeholder="Choose an organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name} ({entry.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError id="clinic-organizationId" message={shownErrors.organizationId} />
              </div>
            ) : organization ? (
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                <Building2
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{organization.name}</p>
                  <p className="mt-1 text-muted-foreground">
                    Organization time zone {organization.timezone}. Location codes must be unique
                    within it.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <FieldLabel htmlFor="clinic-locationCode" required>
                  Location code
                </FieldLabel>
                {canResetCode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto gap-1 px-2 py-1 text-xs"
                    onClick={() => {
                      setLocationCodeTouched(false);
                      update({ locationCode: derivedCode });
                    }}
                  >
                    <RotateCcw aria-hidden="true" className="h-3 w-3" />
                    Reset to {derivedCode}
                  </Button>
                ) : null}
              </div>
              <Input
                id="clinic-locationCode"
                required
                value={values.locationCode}
                maxLength={LOCATION_CODE_MAX_LENGTH}
                onChange={(event) => {
                  setLocationCodeTouched(true);
                  update({ locationCode: event.target.value });
                }}
                placeholder="ridge-clinic"
                {...fieldErrorProps('clinic-locationCode', shownErrors.locationCode)}
              />
              {shownErrors.locationCode ? (
                <FieldError id="clinic-locationCode" message={shownErrors.locationCode} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Lowercase letters, digits and hyphens. Unique within
                  {organization ? ` ${organization.name}` : ' the organization'}.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="clinic-timezone" required>
                Time zone
              </FieldLabel>
              <Combobox
                id="clinic-timezone"
                value={values.timezone}
                options={timeZonePickerOptions}
                matches={matchesTimeZoneQuery}
                onChange={(next) => update({ timezone: next })}
                placeholder="Search time zones"
                emptyLabel="No time zone matches that search."
                {...fieldErrorProps('clinic-timezone', shownErrors.timezone)}
              />
              {shownErrors.timezone ? (
                <FieldError id="clinic-timezone" message={shownErrors.timezone} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Appointment times, reminders and daily reporting are all read in this zone.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="clinic-zoneCode">Zone code</Label>
                <Input
                  id="clinic-zoneCode"
                  value={values.zoneCode}
                  onChange={(event) => update({ zoneCode: event.target.value })}
                  placeholder="greater-accra"
                  {...fieldErrorProps('clinic-zoneCode', shownErrors.zoneCode)}
                />
                {suggestedZoneCodes.length > 0 ? (
                  <div className="space-y-1">
                    <p id="clinic-zoneCode-suggestions" className="text-sm text-muted-foreground">
                      Zones already in use
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedZoneCodes.map((zoneCode) => (
                        <Button
                          key={zoneCode}
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-describedby="clinic-zoneCode-suggestions"
                          aria-pressed={normalizeZoneCode(values.zoneCode) === zoneCode}
                          className="h-8 font-mono text-xs"
                          onClick={() => update({ zoneCode })}
                        >
                          {zoneCode}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {shownErrors.zoneCode ? (
                  <FieldError id="clinic-zoneCode" message={shownErrors.zoneCode} />
                ) : isNewZoneCode ? (
                  <p className="text-sm text-muted-foreground">
                    No other clinic uses this code, so saving starts a new zone.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Optional. Groups clinics for reporting; it does not change who can open this
                    clinic.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <FieldLabel htmlFor="clinic-countryCode" required>
                  Country code
                </FieldLabel>
                <Input
                  id="clinic-countryCode"
                  required
                  value={values.countryCode}
                  maxLength={2}
                  onChange={(event) => update({ countryCode: event.target.value.toUpperCase() })}
                  placeholder="GH"
                  className="uppercase"
                  {...fieldErrorProps('clinic-countryCode', shownErrors.countryCode)}
                />
                {shownErrors.countryCode ? (
                  <FieldError id="clinic-countryCode" message={shownErrors.countryCode} />
                ) : (
                  <p className="text-sm text-muted-foreground">Two-letter ISO code.</p>
                )}
              </div>
            </div>

            {mode === 'edit' ? (
              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="clinic-isActive"
                  checked={values.isActive}
                  onCheckedChange={(next) => update({ isActive: next === true })}
                />
                <div className="-mt-0.5">
                  <Label htmlFor="clinic-isActive">Active</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Inactive clinics keep their history but stop acting as live workspaces.
                  </p>
                </div>
              </div>
            ) : null}
          </fieldset>

          <RequiredLegend />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? mode === 'create'
                  ? 'Creating…'
                  : 'Saving…'
                : mode === 'create'
                  ? 'Create clinic'
                  : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
