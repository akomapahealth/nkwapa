'use client';

import { cn } from '@/lib/utils';
import { motion, type HTMLMotionProps } from 'framer-motion';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  variant?: 'light' | 'dark';
  children: React.ReactNode;
}

export function GlassCard({ variant = 'light', className, children, ...props }: GlassCardProps) {
  return (
    <motion.div
      className={cn(
        'rounded-2xl border shadow-lg',
        // --card, not literal white: the light variant rendered a white slab on a dark canvas.
        variant === 'light' && 'border-border/60 bg-card/70 backdrop-blur-xl',
        variant === 'dark' &&
          'border-foreground/20 bg-foreground/80 text-primary-foreground backdrop-blur-xl',
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
