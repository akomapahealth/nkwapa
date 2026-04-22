'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { Github, GitFork, Star, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const terminalLines = [
  { prompt: '~', cmd: 'git clone https://github.com/nkwapa/nkwapa.git' },
  { prompt: 'nkwapa', cmd: 'pnpm install' },
  { prompt: 'nkwapa', cmd: 'pnpm dev' },
  { prompt: '', cmd: '✓ Ready on http://localhost:3000', isOutput: true },
];

const badges = [
  { icon: Star, label: 'Open Source', value: 'MIT' },
  { icon: GitFork, label: 'Forkable', value: 'Yes' },
  { icon: Users, label: 'Contributors', value: 'Growing' },
];

function TerminalTypewriter({ isInView }: { isInView: boolean }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isInView) return;
    if (prefersReducedMotion) {
      setVisibleLines(terminalLines.length);
      return;
    }

    let timeout: NodeJS.Timeout;
    const showNext = (i: number) => {
      if (i > terminalLines.length) return;
      timeout = setTimeout(
        () => {
          setVisibleLines(i);
          showNext(i + 1);
        },
        i === 0 ? 300 : 800,
      );
    };
    showNext(1);
    return () => clearTimeout(timeout);
  }, [isInView, prefersReducedMotion]);

  return (
    <div className="space-y-1.5 font-mono text-xs sm:text-sm">
      {terminalLines.slice(0, visibleLines).map((line, i) => (
        <motion.div
          key={i}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex gap-2"
        >
          {line.isOutput ? (
            <span className="text-emerald-400">{line.cmd}</span>
          ) : (
            <>
              <span className="select-none text-primary/70">{line.prompt}$</span>
              <span className="text-primary-foreground/90">{line.cmd}</span>
            </>
          )}
        </motion.div>
      ))}
      {visibleLines > 0 && visibleLines <= terminalLines.length && (
        <span className="inline-block h-4 w-1.5 animate-pulse bg-primary-foreground/60" />
      )}
    </div>
  );
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.4, 0.25, 1] as const },
  },
};

export function OpenSourceSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();

  return (
    <section ref={sectionRef} className="border-t border-border bg-muted/20 py-16 md:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 md:grid-cols-2 md:items-center lg:px-8">
        {/* Left — text */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          animate={isInView ? 'visible' : 'hidden'}
          variants={stagger}
        >
          <motion.div variants={fadeUp}>
            <p className="font-landing-nav text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Open source
            </p>
            <h2 className="mt-3 font-landing-heading text-3xl font-black lowercase leading-tight text-foreground md:text-4xl">
              built in the open
            </h2>
          </motion.div>
          <motion.p
            variants={fadeUp}
            className="mt-4 font-landing-body text-base text-muted-foreground"
          >
            Nkwapa is MIT-licensed and designed to be forked, extended, and deployed by any health
            system that needs reliable chronic care management. Contribute code, report issues, or
            deploy your own instance.
          </motion.p>
          <motion.div variants={fadeUp} className="mt-6 flex flex-wrap gap-3">
            {badges.map((b) => {
              const Icon = b.icon;
              return (
                <Badge
                  key={b.label}
                  variant="outline"
                  className="gap-2 rounded-full border-border/70 bg-background px-3 py-1.5 font-landing-body text-xs font-medium text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {b.label}: {b.value}
                </Badge>
              );
            })}
          </motion.div>
          <motion.a
            variants={fadeUp}
            href="https://github.com/nkwapa/nkwapa"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex cursor-pointer items-center gap-2 rounded-full bg-foreground px-5 py-2.5 font-landing-nav text-sm font-semibold text-background transition-opacity duration-200 hover:opacity-90"
          >
            <Github className="h-4 w-4" aria-hidden />
            View on GitHub
          </motion.a>
        </motion.div>

        {/* Right — terminal mockup */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, y: 32 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <div className="overflow-hidden rounded-xl border border-foreground/10 shadow-xl">
            {/* Terminal title bar */}
            <div className="flex items-center gap-2 border-b border-white/10 bg-foreground/95 px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              </div>
              <span className="ml-2 text-[10px] text-white/40">terminal</span>
            </div>

            {/* Terminal content */}
            <div className="landing-glass-dark min-h-[200px] p-5">
              <TerminalTypewriter isInView={isInView} />
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
