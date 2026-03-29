"use client";

import { landingCardHover } from "@/lib/landing-card-hover";

const pillars = [
  "FHIR-friendly workflows",
  "Role-based access",
  "Offline queue & sync",
  "Research exports",
];

export function TrustBar() {
  return (
    <section className="border-y border-border bg-card/60 py-6 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-4 px-6 text-center lg:flex-row lg:justify-between lg:text-left lg:px-8">
        <p className="font-landing-nav text-sm font-medium text-muted-foreground">
          Built for programs that need reliability where connectivity is not guaranteed
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-3 lg:justify-end">
          {pillars.map((label) => (
            <li
              key={label}
              className={`rounded-full border border-border/70 bg-background px-3 py-1.5 font-landing-body text-xs font-medium text-foreground shadow-sm ${landingCardHover}`}
            >
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
