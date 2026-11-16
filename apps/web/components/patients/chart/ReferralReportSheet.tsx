'use client';

import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Check, Copy, Download, FileLock2, Mail, ShieldCheck } from 'lucide-react';
import { apiFetch, getErrorMessage, readApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { saveBlob } from '@/lib/download';
import { formatOpsDay } from '@/lib/ops';
import { useCopyToClipboard } from '@/lib/use-copy-to-clipboard';
import {
  REFERRAL_REASON_MAX,
  REFERRAL_SECTION_COPY,
  defaultReferralSections,
  groupPasscode,
  pdfBlobFromBase64,
  referralShareSummary,
  type ReferralDelivery,
  type ReferralReportSection,
  type ReferralUrgency,
} from '@/lib/referral-report';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormActions } from '@/components/ui/form-actions';
import { FieldError, FieldLabel, fieldErrorProps, focusFirstInvalid } from '@/components/ui/field';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/app-shell/SegmentedControl';
import { InlineNotice } from '@/components/ops/OpsShared';
import { cn } from '@/lib/utils';

type Result =
  | { delivery: 'DOWNLOAD'; passcode: string; filename: string; file: string }
  | { delivery: 'EMAIL'; passcode: string; sentTo: string };

type Errors = Partial<Record<'reason' | 'recipientEmail' | 'consent', string>>;

const URGENCY_OPTIONS = [
  { value: 'ROUTINE', label: 'Routine' },
  { value: 'SOON', label: 'Soon' },
  { value: 'URGENT', label: 'Urgent' },
] as const;

const DELIVERY_OPTIONS = [
  { value: 'DOWNLOAD', label: 'Download' },
  { value: 'EMAIL', label: 'Email' },
] as const;

/** Right on a wide screen, a bottom sheet on a phone, as the filter sheets are. */
function useWideSheet(minWidth = 600) {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [minWidth]);
  return wide;
}

/**
 * The referral report sheet (#344): what to share, who it is for, how it travels, then the passcode
 * once. Nothing here is kept: closing the sheet drops the passcode and the file with it.
 */
export function ReferralReportSheet({
  open,
  onOpenChange,
  clinicId,
  patientId,
  patientName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinicId: string;
  patientId: string;
  patientName: string;
}) {
  const getToken = useAuth();
  const wide = useWideSheet();
  const ids = useId();
  const id = (name: string) => `${ids}-${name}`;
  const base = `/clinics/${encodeURIComponent(clinicId)}/patients/${encodeURIComponent(patientId)}/referral-report`;

  const [allowed, setAllowed] = useState<ReferralReportSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [urgency, setUrgency] = useState<ReferralUrgency>('ROUTINE');
  const [recipientName, setRecipientName] = useState('');
  const [facility, setFacility] = useState('');
  const [sections, setSections] = useState<ReferralReportSection[]>([]);
  const [delivery, setDelivery] = useState<ReferralDelivery>('DOWNLOAD');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [consent, setConsent] = useState(false);
  /** When the patient's referral consent was granted, if one is on file: then no tick is needed. */
  const [consentOnFile, setConsentOnFile] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const { state: copyState, copy } = useCopyToClipboard();

  const loadSections = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await apiFetch(`${base}/sections`, { getToken, activeClinicId: clinicId });
      if (!response.ok) throw await readApiError(response);
      const body = (await response.json()) as {
        sections: ReferralReportSection[];
        referralConsent: { grantedAt: string } | null;
      };
      setAllowed(body.sections);
      setConsentOnFile(body.referralConsent?.grantedAt ?? null);
      setSections(defaultReferralSections(body.sections));
    } catch (error) {
      setLoadError(getErrorMessage(error, 'The report options could not be loaded.'));
    }
  }, [base, clinicId, getToken]);

  useEffect(() => {
    // Every time it opens: consent may have been recorded or revoked since.
    if (open) void loadSections();
  }, [open, loadSections]);

  // A fresh form every time the sheet opens: nothing from the last referral carries over.
  useEffect(() => {
    if (open) return;
    setReason('');
    setUrgency('ROUTINE');
    setRecipientName('');
    setFacility('');
    setDelivery('DOWNLOAD');
    setRecipientEmail('');
    setConsent(false);
    setErrors({});
    setSubmitted(false);
    setSubmitError(null);
    setResult(null);
    if (allowed) setSections(defaultReferralSections(allowed));
  }, [open, allowed]);

  const validate = (): Errors => {
    const next: Errors = {};
    if (!reason.trim()) next.reason = 'Say why the patient is being referred.';
    if (delivery === 'EMAIL' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) {
      next.recipientEmail = 'Enter the email address the report should go to.';
    }
    if (!consentOnFile && !consent)
      next.consent = 'Confirm the patient agreed to this referral today.';
    return next;
  };

  // Once a submit has failed, each field rechecks as it is corrected.
  useEffect(() => {
    if (submitted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, delivery, recipientEmail, consent, consentOnFile, submitted]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      focusFirstInvalid(
        {
          [id('reason')]: found.reason,
          [id('email')]: found.recipientEmail,
          [id('consent')]: found.consent,
        },
        [id('reason'), id('email'), id('consent')],
      );
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const response = await apiFetch(base, {
        method: 'POST',
        getToken,
        activeClinicId: clinicId,
        body: JSON.stringify({
          reason: reason.trim(),
          urgency,
          recipientName: recipientName.trim() || undefined,
          recipientFacility: facility.trim() || undefined,
          sections,
          delivery,
          recipientEmail: delivery === 'EMAIL' ? recipientEmail.trim() : undefined,
          patientAgreedToday: consentOnFile ? undefined : consent,
        }),
      });
      if (!response.ok) throw await readApiError(response);
      setResult((await response.json()) as Result);
    } catch (error) {
      setSubmitError(getErrorMessage(error, 'The report could not be made. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (section: ReferralReportSection, checked: boolean) =>
    setSections((current) =>
      (allowed ?? []).filter((s) => (s === section ? checked : current.includes(s))),
    );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={wide ? 'right' : 'bottom'}
        className={cn(
          'flex flex-col bg-card p-0 pb-[env(safe-area-inset-bottom)]',
          wide ? 'w-full sm:max-w-lg' : 'max-h-[92dvh] rounded-t-xl',
        )}
      >
        <SheetHeader className="shrink-0 px-5 pb-4 text-left">
          <SheetTitle className="pr-12 font-body">
            {result
              ? result.delivery === 'EMAIL'
                ? 'Report emailed'
                : 'Report ready'
              : 'Referral report'}
          </SheetTitle>
          <SheetDescription>
            {result
              ? result.delivery === 'EMAIL'
                ? `Sent to ${result.sentTo}. The PDF opens only with the passcode below.`
                : 'Save the PDF, then give the passcode to the person receiving it.'
              : `A locked PDF of ${patientName}’s record for the clinician or facility taking over care.`}
          </SheetDescription>
        </SheetHeader>

        {result ? (
          <div
            key="result"
            className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:slide-in-from-bottom-0"
          >
            <section
              aria-labelledby={id('passcode-label')}
              className="rounded-lg border border-border bg-background px-4 py-5 text-center"
            >
              <p id={id('passcode-label')} className="type-label text-muted-foreground">
                Passcode
              </p>
              <p
                data-testid="referral-passcode"
                aria-label={`Passcode ${result.passcode.split('').join(' ')}`}
                className="mt-2 select-all font-mono text-[2rem] font-medium leading-tight tracking-[0.14em] tabular-nums text-foreground"
                translate="no"
              >
                {groupPasscode(result.passcode)}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void copy(result.passcode)}
              >
                {copyState === 'copied' ? (
                  <Check aria-hidden="true" />
                ) : (
                  <Copy aria-hidden="true" />
                )}
                {copyState === 'copied'
                  ? 'Copied'
                  : copyState === 'failed'
                    ? 'Copy failed'
                    : 'Copy passcode'}
              </Button>
              <span className="sr-only" role="status">
                {copyState === 'copied' ? 'Passcode copied' : ''}
              </span>
            </section>
            <InlineNotice tone="warning" live={false}>
              Share this code by phone or SMS, not by email. It is shown once.
            </InlineNotice>
          </div>
        ) : (
          <form
            id={id('form')}
            noValidate
            onSubmit={submit}
            className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-5"
          >
            <div className="space-y-2">
              <FieldLabel htmlFor={id('reason')} required>
                Reason for referral
              </FieldLabel>
              <Textarea
                id={id('reason')}
                value={reason}
                maxLength={REFERRAL_REASON_MAX}
                rows={3}
                required
                onChange={(event) => setReason(event.target.value)}
                {...fieldErrorProps(id('reason'), errors.reason)}
              />
              <div className="flex items-start justify-between gap-3">
                <FieldError id={id('reason')} message={errors.reason} reserveSpace={submitted} />
                <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                  {reason.length}/{REFERRAL_REASON_MAX}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium" id={id('urgency')}>
                Urgency
              </p>
              <SegmentedControl
                label="Urgency"
                value={urgency}
                options={URGENCY_OPTIONS}
                onChange={setUrgency}
              />
            </div>

            <fieldset className="grid gap-4 compact:grid-cols-2">
              <legend className="mb-2 text-sm font-medium">Referred to</legend>
              <div className="space-y-2">
                <Label htmlFor={id('recipient')}>Clinician</Label>
                <Input
                  id={id('recipient')}
                  value={recipientName}
                  maxLength={120}
                  autoComplete="off"
                  onChange={(event) => setRecipientName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={id('facility')}>Facility</Label>
                <Input
                  id={id('facility')}
                  value={facility}
                  maxLength={160}
                  autoComplete="off"
                  onChange={(event) => setFacility(event.target.value)}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium">Include</legend>
              {loadError ? (
                <InlineNotice tone="error" className="mt-2">
                  {loadError}{' '}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => void loadSections()}
                  >
                    Try again
                  </button>
                </InlineNotice>
              ) : !allowed ? (
                <div className="mt-2 space-y-2" aria-hidden="true">
                  {[0, 1, 2].map((row) => (
                    <div
                      key={row}
                      className="h-11 animate-pulse rounded-md bg-muted motion-reduce:animate-none"
                    />
                  ))}
                </div>
              ) : (
                <ul className="-mx-3 mt-1">
                  {allowed.map((section) => {
                    const copyFor = REFERRAL_SECTION_COPY[section];
                    const checkboxId = id(`section-${section}`);
                    return (
                      <li key={section}>
                        <label
                          htmlFor={checkboxId}
                          className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 [@media(hover:hover)]:hover:bg-muted/60"
                        >
                          <Checkbox
                            id={checkboxId}
                            className="mt-0.5"
                            checked={sections.includes(section)}
                            onCheckedChange={(checked) => toggle(section, checked === true)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">
                              {copyFor.label}
                            </span>
                            <span className="block text-sm text-muted-foreground">
                              {copyFor.description}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <div className="space-y-3">
              <p className="text-sm font-medium">Send it by</p>
              <SegmentedControl
                label="Send it by"
                value={delivery}
                options={DELIVERY_OPTIONS}
                onChange={setDelivery}
              />
              {delivery === 'EMAIL' ? (
                <div className="space-y-2 animate-in fade-in-0 duration-150">
                  <FieldLabel htmlFor={id('email')} required>
                    Recipient email
                  </FieldLabel>
                  <Input
                    id={id('email')}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    value={recipientEmail}
                    maxLength={320}
                    required
                    onChange={(event) => setRecipientEmail(event.target.value)}
                    {...fieldErrorProps(id('email'), errors.recipientEmail)}
                  />
                  <FieldError id={id('email')} message={errors.recipientEmail} />
                  <p className="text-sm text-muted-foreground">
                    The email names only this clinic. The passcode is never in it.
                  </p>
                </div>
              ) : null}
            </div>

            {consentOnFile ? (
              <p className="flex items-start gap-3 rounded-md border border-border bg-background px-3 py-3 text-sm text-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  Referral consent on file since {formatOpsDay(consentOnFile)}.
                  <span className="mt-0.5 block text-muted-foreground">
                    This report is recorded with who sent it and where it went.
                  </span>
                </span>
              </p>
            ) : (
              <div className="space-y-2">
                <label
                  htmlFor={id('consent')}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border bg-background px-3 py-3"
                >
                  <Checkbox
                    id={id('consent')}
                    className="mt-0.5"
                    checked={consent}
                    required
                    onCheckedChange={(checked) => setConsent(checked === true)}
                    {...fieldErrorProps(id('consent'), errors.consent)}
                  />
                  <span className="text-sm text-foreground">
                    The patient agreed today to this report being shared for their referral.
                    <span className="mt-0.5 block text-muted-foreground">
                      No referral consent is on file. Record one on the Consent tab to skip this
                      next time. Your confirmation is recorded.
                    </span>
                  </span>
                </label>
                <FieldError id={id('consent')} message={errors.consent} />
              </div>
            )}

            <p className="text-sm text-muted-foreground" aria-live="polite">
              <span className="font-medium text-foreground">What will be shared: </span>
              {referralShareSummary({ patientName, sections, delivery, recipientEmail, facility })}
            </p>

            {submitError ? <InlineNotice tone="error">{submitError}</InlineNotice> : null}
          </form>
        )}

        <FormActions className="shrink-0 border-border px-5 py-4">
          {result ? (
            <>
              <Button
                type="button"
                variant={result.delivery === 'DOWNLOAD' ? 'outline' : 'default'}
                onClick={() => onOpenChange(false)}
              >
                Done
              </Button>
              {/* Saving the file is the job here, so it is the primary action (last, per FormActions). */}
              {result.delivery === 'DOWNLOAD' ? (
                <Button
                  type="button"
                  onClick={() => void saveBlob(pdfBlobFromBase64(result.file), result.filename)}
                >
                  <Download aria-hidden="true" />
                  Download PDF
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" form={id('form')} disabled={busy || !allowed}>
                {delivery === 'EMAIL' ? (
                  <Mail aria-hidden="true" />
                ) : (
                  <FileLock2 aria-hidden="true" />
                )}
                {busy ? 'Making report…' : delivery === 'EMAIL' ? 'Email report' : 'Make report'}
              </Button>
            </>
          )}
        </FormActions>
      </SheetContent>
    </Sheet>
  );
}
