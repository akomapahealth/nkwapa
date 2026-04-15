/**
 * Shared hover styles for landing marketing surfaces (aligned with bento cards).
 * Subtle lift + depth without large layout shift.
 */
export const landingCardHover =
  'transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_48px_-12px_hsl(var(--primary)/0.12),0_0_0_1px_hsl(var(--primary)/0.08)]';

/** Primary / tinted panels: brighten slightly + deeper shadow */
export const landingPrimaryPanelHover =
  'transition-all duration-300 ease-out motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:-translate-y-0.5 hover:shadow-[0_28px_56px_-14px_hsl(var(--primary)/0.28)] hover:ring-2 hover:ring-primary-foreground/20';
