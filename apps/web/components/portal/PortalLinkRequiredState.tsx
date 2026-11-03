import { Link2Off } from 'lucide-react';
import { PortalPanel } from '@/components/portal/PortalPanels';

export function PortalLinkRequiredState({ clinicName }: { clinicName?: string | null }) {
  return (
    <PortalPanel
      title="Your account is not linked to a patient record"
      description="Ask your clinic to link this account so you can see your readings and appointments."
      action={<Link2Off aria-hidden="true" className="size-5 text-warning-ink" />}
      contentClassName="space-y-2 border-b border-border py-3 text-sm leading-6 text-muted-foreground"
    >
      {clinicName && <p className="font-medium text-foreground">{clinicName}</p>}
      <p>If you recently changed clinics, ask your new clinic to link your account.</p>
    </PortalPanel>
  );
}
