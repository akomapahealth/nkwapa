'use client';

import { useRef } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Image from 'next/image';

interface ParallaxImageProps {
  src: string;
  alt: string;
  speed?: number;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}

export function ParallaxImage({
  src,
  alt,
  speed = 0.15,
  className,
  imgClassName,
  priority = false,
}: ParallaxImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [speed * -100, speed * 100]);

  return (
    <div ref={ref} className={cn('relative overflow-hidden', className)}>
      <motion.div className="h-full w-full" style={prefersReducedMotion ? {} : { y }}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className={cn('object-cover', imgClassName)}
          priority={priority}
        />
      </motion.div>
    </div>
  );
}
