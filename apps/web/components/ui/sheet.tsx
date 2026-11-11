'use client';

import * as React from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useSheetDrag } from './use-sheet-drag';
import { useOverlayInput } from './use-overlay-input';

function Sheet(props: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Root>) {
  useOverlayInput();
  return <SheetPrimitive.Root {...props} />;
}

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      'modal-motion fixed inset-0 z-50 bg-black/80 ease-out-strong data-[state=open]:duration-sheet data-[state=closed]:duration-sheet-exit data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  // 240ms in, 190ms out on the drawer curve (MASTER 9.1 rule 3); the scrim keeps the same clock.
  // Keep transition-transform: without it the handle drag stops tracking in Chromium (sheet-drag
  // spec, R7.1). Not root-caused; nothing transitions transform here, the keyframes own it.
  'modal-motion safe-edges-x fixed z-50 max-w-full gap-4 bg-background p-6 shadow-lg transition-transform ease-drawer data-[state=open]:duration-sheet data-[state=closed]:duration-sheet-exit data-[state=open]:animate-in data-[state=closed]:animate-out',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'safe-edges-y inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'safe-edges-y inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

interface SheetContentProps
  extends
    React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
  const { setNode, closeRef, handleProps } = useSheetDrag(side ?? 'right');
  const returnFocusTo = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      setNode(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref, setNode],
  );
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={contentRef}
        className={cn(sheetVariants({ side }), className)}
        {...props}
        onOpenAutoFocus={(event) => {
          returnFocusTo.current = document.activeElement as HTMLElement | null;
          onOpenAutoFocus?.(event);
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          // Provider/selection-controlled Sheets can have no Radix Trigger at all.
          const previous = returnFocusTo.current;
          const target =
            previous?.isConnected && previous !== document.body && previous.getClientRects().length
              ? previous
              : document.getElementById('main-content');
          if (target && target !== document.body) {
            event.preventDefault();
            target.focus();
          }
        }}
      >
        <SheetPrimitive.Close
          ref={closeRef}
          className="absolute right-[max(1rem,env(safe-area-inset-right))] top-4 flex h-11 w-11 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity duration-fast ease-out-strong hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
        <div className="flex h-11 shrink-0 justify-center">
          <button
            {...handleProps}
            type="button"
            aria-label={`Close sheet (or drag ${side === 'bottom' ? 'down' : side === 'top' ? 'up' : side} to dismiss)`}
            className="flex h-11 w-16 touch-none select-none items-center justify-center rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            style={{ cursor: side === 'top' || side === 'bottom' ? 'ns-resize' : 'ew-resize' }}
          >
            <span
              aria-hidden="true"
              className={cn(
                'rounded-full bg-current',
                side === 'top' || side === 'bottom' ? 'h-1 w-8' : 'h-6 w-1',
              )}
            />
          </button>
        </div>
        {children}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold text-foreground', className)}
    {...props}
  />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
