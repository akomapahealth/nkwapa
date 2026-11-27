'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

/** Directors and system admins hold this; nobody else sees the field. */
export const DEMO_MANAGE_PERMISSION = 'PATIENT.DEMO.MANAGE';

/**
 * Marks a chart as demo (training) data (2026-11-21). A demo patient goes through the station line
 * like any other, but is left out of reports, research and reminders.
 */
export function DemoPatientField({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id="isDemo"
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor="isDemo">Demo patient for training</Label>
        <p className="text-sm text-muted-foreground">
          Staff see a Demo tag. The chart is kept out of reports, research and reminders.
        </p>
      </div>
    </div>
  );
}

/** The tag every staff member sees on a demo chart, so nobody treats it as a real patient. */
export function DemoBadge({ isDemo }: { isDemo?: boolean | null }) {
  return isDemo ? (
    <Badge variant="warning" data-testid="demo-badge">
      Demo
    </Badge>
  ) : null;
}
