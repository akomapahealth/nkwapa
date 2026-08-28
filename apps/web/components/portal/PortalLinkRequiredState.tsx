'use client';

import { Link2Off, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface PortalLinkRequiredStateProps {
  clinicName?: string | null;
}

/**
 * "Signed in, but not yet linked to a patient record here."
 *
 * Deliberately not an error state and deliberately without a retry: nothing failed, and pressing
 * a button will not link the record -- clinic staff have to. The hue is `--warning` because this
 * is a "something has to be done" state; it used to be hardcoded amber with a literal `bg-white/80`
 * that turned into a bright rectangle the moment dark mode was wired up. The tint-and-ink pair
 * resolves in both themes, so no `dark:` utility belongs here.
 */
export function PortalLinkRequiredState({ clinicName }: PortalLinkRequiredStateProps) {
  return (
    <Card className="border-warning/40">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="warning" className="rounded-full px-3 py-1">
            Portal link required
          </Badge>
          {clinicName ? (
            <Badge variant="outline" className="rounded-full border-border px-3 py-1">
              {clinicName}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-start gap-4">
          <span className="rounded-lg bg-warning/12 p-3 text-warning-ink">
            <Link2Off aria-hidden="true" className="h-6 w-6" />
          </span>
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              Your account is signed in, but it is not linked to a patient record for this clinic
              yet.
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              Ask clinic staff to open your patient record and use the portal-link action. Once that
              link is saved, your overview, health history, and appointment details will load
              normally.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
            What staff should do
          </h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Find the correct patient chart, link this portal account from the patient record, and
            then keep or remove any patient role assignments based on the intended clinic access.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <h3 className="text-sm font-medium text-foreground">If you recently changed clinics</h3>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Portal access stays clinic-specific. You may need staff to link your account again in
            the current clinic before this page can show your information.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
