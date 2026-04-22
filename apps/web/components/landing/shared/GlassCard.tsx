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
        variant === 'light' && 'border-white/30 bg-white/70 backdrop-blur-xl',
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
