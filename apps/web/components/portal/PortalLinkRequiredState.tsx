'use client';

import { Link2Off, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface PortalLinkRequiredStateProps {
  clinicName?: string | null;
}

export function PortalLinkRequiredState({ clinicName }: PortalLinkRequiredStateProps) {
  return (
    <Card className="overflow-hidden border-amber-300/70 bg-gradient-to-br from-amber-50 via-background to-card shadow-lg shadow-amber-100/40">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-full border-amber-300 bg-white/80 px-3 py-1 text-amber-900"
          >
            Portal link required
          </Badge>
          {clinicName ? (
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {clinicName}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-amber-100 p-3 text-amber-900">
            <Link2Off className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">
              Your account is signed in, but it is not linked to a patient record for this clinic
              yet.
            </CardTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground md:text-base">
              Ask clinic staff to open your patient record and use the portal-link action. Once that
              link is saved, your overview, health history, and appointment details will load
              normally.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            What staff should do
          </div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Find the correct patient chart, link this portal account from the patient record, and
            then keep or remove any patient role assignments based on the intended clinic access.
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
          <p className="text-sm font-medium text-foreground">If you recently changed clinics</p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Portal access stays clinic-specific. You may need staff to link your account again in
            the current clinic before this page can show your information.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
