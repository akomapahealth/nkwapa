"use client";

import { useKeycloak } from "@/app/KeycloakProvider";
import { trackEvent } from "@/lib/analytics";
import { landingPrimaryPanelHover } from "@/lib/landing-card-hover";

export function CtaBanner() {
  const { login } = useKeycloak() ?? {};

  return (
    <section className="py-8">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div
          className={`flex flex-col items-center justify-between gap-4 rounded-3xl bg-primary px-8 py-8 shadow-lg ring-1 ring-primary/20 sm:flex-row sm:gap-6 ${landingPrimaryPanelHover}`}
        >
          <p className="text-center font-landing-heading text-lg font-bold lowercase text-primary-foreground sm:text-left md:text-xl">
            better chronic care starts with you.
          </p>
          <button
            type="button"
            onClick={() => {
              trackEvent({ name: "landing_cta_sign_in", properties: { source: "cta_banner" } });
              login?.();
            }}
            className="cursor-pointer whitespace-nowrap rounded-full border-2 border-primary-foreground bg-primary-foreground px-8 py-3 font-landing-nav text-sm font-semibold text-primary transition-colors duration-200 hover:bg-transparent hover:text-primary-foreground"
          >
            Sign in
          </button>
        </div>
      </div>
    </section>
  );
}
