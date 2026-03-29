"use client";

import { useState } from "react";
import { landingPrimaryPanelHover } from "@/lib/landing-card-hover";

export function SubscribeSection() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <section className="py-12 md:py-16">
      <div className="mx-auto max-w-3xl px-6 lg:px-8">
        <div
          className={`overflow-hidden rounded-2xl bg-primary px-8 py-12 text-center shadow-lg md:px-12 md:py-16 ${landingPrimaryPanelHover}`}
          style={{
            backgroundImage: `radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.12) 0%, transparent 100%), radial-gradient(1px 1px at 80% 70%, rgba(255,255,255,0.08) 0%, transparent 100%)`,
          }}
        >
          <h2 className="font-landing-heading text-2xl font-black lowercase text-white md:text-4xl">
            subscribe<br />
            to our mailing list
          </h2>

          {submitted ? (
            <p className="mt-6 font-landing-body text-base text-white/90">
              Thank you for subscribing. We will keep you updated.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="text"
                  placeholder="First Name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  aria-label="First Name"
                  className="w-full rounded-full border-2 border-white/40 bg-transparent px-5 py-3 font-landing-body text-sm text-white placeholder-white/60 outline-none transition-colors duration-200 focus:border-white"
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  aria-label="Last Name"
                  className="w-full rounded-full border-2 border-white/40 bg-transparent px-5 py-3 font-landing-body text-sm text-white placeholder-white/60 outline-none transition-colors duration-200 focus:border-white"
                />
              </div>
              <div className="flex gap-3">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  aria-label="Email address"
                  className="flex-1 rounded-full border-2 border-white/40 bg-transparent px-5 py-3 font-landing-body text-sm text-white placeholder-white/60 outline-none transition-colors duration-200 focus:border-white"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-full bg-white px-6 py-3 font-landing-nav text-sm font-semibold text-primary transition-colors duration-200 hover:bg-white/90"
                >
                  Send
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
