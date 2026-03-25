"use client";

import { useKeycloak } from "@/app/KeycloakProvider";
import { trackEvent } from "@/lib/analytics";

const navLinks = [
  { label: "Product", href: "#product" },
  { label: "Workflow", href: "#workflow" },
  { label: "Story", href: "#our-story" },
  { label: "Impact", href: "#impact" },
];

export function LandingNav() {
  const { login } = useKeycloak() ?? {};

  const handleAnchor = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const id = href.replace("#", "");
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleSignIn = () => {
    trackEvent({ name: "landing_cta_sign_in", properties: { source: "nav" } });
    login?.();
  };

  return (
    <div className="pointer-events-none fixed top-4 left-0 right-0 z-50 flex justify-center px-4 md:top-6">
      <nav className="pointer-events-auto flex w-full max-w-5xl items-center justify-between gap-4 rounded-full border border-border/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur-md md:px-6">
        <a
          href="/"
          className="font-landing-heading text-lg font-black lowercase tracking-tight text-foreground no-underline transition-opacity duration-200 hover:opacity-80 cursor-pointer"
        >
          nkwapa
        </a>

        <div className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => handleAnchor(e, link.href)}
              className="font-landing-nav text-sm font-medium text-muted-foreground no-underline transition-colors duration-200 hover:text-foreground cursor-pointer"
            >
              {link.label}
            </a>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSignIn}
          className="cursor-pointer rounded-full bg-primary px-5 py-2 font-landing-nav text-sm font-semibold text-primary-foreground shadow-sm transition-colors duration-200 hover:bg-primary/90"
        >
          Sign in
        </button>
      </nav>
    </div>
  );
}
