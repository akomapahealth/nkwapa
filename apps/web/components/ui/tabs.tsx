'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { MotionConfig, motion } from 'framer-motion';

import { cn } from '@/lib/utils';

/**
 * Record-section tabs, the R0 pilot's `.tabs`: muted labels on a rule, the active one in ink with
 * a 2px primary underline. The underline is one shared element (`layoutId`) that moves to the new
 * tab with ease-in-out (R0-AUDIT §6 rules 9, 20). Arrow-key navigation snaps instead (rule 21).
 * Radix still owns the roles, `aria-selected` and keyboard behaviour.
 */

/** `--ease-in-out` from globals.css; Motion needs the curve as numbers. */
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

interface TabsState {
  value: string | undefined;
  id: string;
  /** The tab last pressed with a pointer. Only that change animates; arrow keys, the first render
   * and changes made elsewhere snap (rule 21). */
  pressed: React.MutableRefObject<string | null>;
}

const TabsStateContext = React.createContext<TabsState | null>(null);

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>
>(({ value, defaultValue, onValueChange, onKeyDownCapture, ...props }, ref) => {
  // Radix keeps the active value to itself, so mirror it here for the underline.
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const current = value ?? uncontrolled;
  const id = React.useId();
  const pressed = React.useRef<string | null>(null);
  const state = React.useMemo(() => ({ value: current, id, pressed }), [current, id]);

  return (
    <TabsStateContext.Provider value={state}>
      <MotionConfig reducedMotion="user">
        <TabsPrimitive.Root
          ref={ref}
          value={current}
          onValueChange={(next) => {
            setUncontrolled(next);
            onValueChange?.(next);
          }}
          onKeyDownCapture={(event) => {
            pressed.current = null;
            onKeyDownCapture?.(event);
          }}
          {...props}
        />
      </MotionConfig>
    </TabsStateContext.Provider>
  );
});
Tabs.displayName = TabsPrimitive.Root.displayName;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  // Tabs never wrap: a wrapped row leaves the underline floating mid-list. They scroll instead,
  // and `layoutScroll` keeps the underline's measurement right when a press scrolls a tab into view.
  <motion.div layoutScroll className="max-w-full overflow-x-auto">
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex h-auto min-w-full items-center justify-start gap-1 border-b border-rule text-muted-foreground',
        className,
      )}
      {...props}
    />
  </motion.div>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, children, value, onPointerDown, ...props }, ref) => {
  const state = React.useContext(TabsStateContext);
  const active = state?.value === value;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      value={value}
      onPointerDown={(event) => {
        if (state) state.pressed.current = value;
        onPointerDown?.(event);
      }}
      className={cn(
        // Weight stays 500 in both states (the pilot goes to 600): a bolder active label would
        // widen its tab and shift every tab after it. The ring is inset because the scroll wrapper
        // clips anything outside the tab.
        'relative inline-flex min-h-[var(--tab-height)] cursor-pointer touch-manipulation items-center justify-center whitespace-nowrap rounded-t-md px-3 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground [@media(pointer:coarse)]:min-h-12',
        className,
      )}
      {...props}
    >
      {children}
      {active && state ? (
        <motion.span
          layoutId={`${state.id}-underline`}
          layoutDependency={state.value}
          transition={
            state.pressed.current === value ? { duration: 0.2, ease: EASE_IN_OUT } : { duration: 0 }
          }
          aria-hidden="true"
          className="absolute inset-x-2 -bottom-px h-0.5 bg-primary"
        />
      ) : null}
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
