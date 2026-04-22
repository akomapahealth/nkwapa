'use client';

import { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NoiseTexture } from './shared/NoiseTexture';

export function SubscribeSection() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-2xl bg-primary px-8 py-12 text-center shadow-lg md:px-12 md:py-16"
          style={{
            backgroundImage: `radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.12) 0%, transparent 100%), radial-gradient(1px 1px at 80% 70%, rgba(255,255,255,0.08) 0%, transparent 100%)`,
          }}
        >
          <NoiseTexture opacity={0.04} />

          {/* Floating dots */}
          {!prefersReducedMotion && (
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <motion.div
                className="absolute left-[15%] top-[20%] h-2 w-2 rounded-full bg-primary-foreground/10"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute right-[20%] bottom-[25%] h-1.5 w-1.5 rounded-full bg-primary-foreground/10"
                animate={{ y: [0, 6, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              />
            </div>
          )}

          <div className="relative z-10">
            {/* Merged CTA headline */}
            <h2 className="font-landing-heading text-2xl font-black lowercase text-white md:text-4xl">
              better chronic care starts with you.
            </h2>
            <p className="mt-3 font-landing-body text-sm text-white/80">
              Subscribe to stay updated on Nkwapa&apos;s progress and releases.
            </p>

            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="success"
                  initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-8 flex flex-col items-center gap-3"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                    <Check className="h-6 w-6 text-white" />
                  </div>
                  <p className="font-landing-body text-base text-white/90">
                    Thank you for subscribing. We will keep you updated.
                  </p>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  exit={prefersReducedMotion ? {} : { opacity: 0, y: -10 }}
                  onSubmit={handleSubmit}
                  className="mt-8 space-y-4"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      type="text"
                      placeholder="First Name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      aria-label="First Name"
                      className="rounded-full border-2 border-white/40 bg-transparent px-5 py-3 font-landing-body text-sm text-white placeholder-white/60 focus:border-white focus-visible:ring-0"
                    />
                    <Input
                      type="text"
                      placeholder="Last Name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      aria-label="Last Name"
                      className="rounded-full border-2 border-white/40 bg-transparent px-5 py-3 font-landing-body text-sm text-white placeholder-white/60 focus:border-white focus-visible:ring-0"
                    />
                  </div>
                  <div className="flex gap-3">
                    <Input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      aria-label="Email address"
                      className="flex-1 rounded-full border-2 border-white/40 bg-transparent px-5 py-3 font-landing-body text-sm text-white placeholder-white/60 focus:border-white focus-visible:ring-0"
                    />
                    <Button
                      type="submit"
                      className="cursor-pointer rounded-full bg-white px-6 py-3 font-landing-nav text-sm font-semibold text-primary hover:bg-white/90"
                    >
                      Send
                    </Button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
