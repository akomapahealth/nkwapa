'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { useOverlayInput } from './use-overlay-input';
import { useReturnFocus } from './use-return-focus';

function Dialog(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  useOverlayInput();
  return <DialogPrimitive.Root {...props} />;
}
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('anchored-overlay dialog-scrim fixed inset-0 z-50 bg-black/80', className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /**
   * R7.4: `form` for a dialog that holds a multi-field form. Below 600px it becomes a bottom sheet
   * (full width, lifted above the virtual keyboard) and, at every width, its `DialogFooter` stays
   * pinned to the bottom while the fields scroll (globals.css `.dialog-form`). Confirmations and
   * single-field prompts keep the default: a centred alert, which is what MASTER 5.4 asks for.
   */
  variant?: 'alert' | 'form';
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children, variant = 'alert', onOpenAutoFocus, onCloseAutoFocus, ...props },
    ref,
  ) => {
    const focusReturn = useReturnFocus(onOpenAutoFocus, onCloseAutoFocus);
    return (
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            // A dialog must fit the screen it opens on. The default was a fixed max width with no
            // height bound and no scrolling, so a long clinical form ran off a 375 pixel viewport with
            // its actions unreachable. Every panel had been working around this with its own override.
            // Centred by margin, not a translate, so the motion owns transform and scales from the
            // centre. R7.3: the same transition clock as menus and Selects (globals.css), so a dialog
            // closed mid-entrance reverses from where it is instead of restarting its exit.
            'anchored-overlay fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] w-[calc(100%-1.5rem)] max-w-lg gap-4 overflow-y-auto overscroll-contain rounded-xl border bg-background p-6',
            variant === 'form' && 'dialog-form',
            className,
          )}
          {...props}
          {...focusReturn}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1.5 text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'dialog-footer flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
