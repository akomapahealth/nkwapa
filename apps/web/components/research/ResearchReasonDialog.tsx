'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ReasonPrompt {
  title: string;
  description: string;
  confirmLabel: string;
  placeholder: string;
  onConfirm: (reason: string) => Promise<boolean>;
}

/**
 * Asks for the reason a reviewer will read later: rejecting an export, rejecting or revoking a
 * schedule, and rerunning a period all record one.
 */
export function ResearchReasonDialog({
  prompt,
  onClose,
}: {
  prompt: ReasonPrompt | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason('');
    onClose();
  };

  const confirm = async () => {
    if (!prompt) return;
    setBusy(true);
    try {
      if (await prompt.onConfirm(reason.trim())) close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => (!open ? close() : undefined)}>
      <DialogContent className="max-w-lg rounded-lg border-border/80">
        <DialogHeader>
          <DialogTitle className="font-heading text-2xl">{prompt?.title}</DialogTitle>
          <DialogDescription>{prompt?.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="researchReason">Reason</Label>
          <Textarea
            id="researchReason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={prompt?.placeholder}
            maxLength={500}
            rows={5}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void confirm()} disabled={!reason.trim() || busy}>
            {busy ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : null}
            {prompt?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
