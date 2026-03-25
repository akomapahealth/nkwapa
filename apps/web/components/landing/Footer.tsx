"use client";

import { useKeycloak } from "@/app/KeycloakProvider";

const footerLinks = {
  "for you": ["sign in", "get started", "contact us"],
  "features": ["offline sync", "chronic workflows", "multi-clinic", "RBAC & audit"],
  "resources": ["documentation", "open source", "changelog"],
};

export function Footer() {
  const { login } = useKeycloak() ?? {};

  return (
    <footer className="border-t border-[#E2E8F0] py-12 md:py-16">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.2fr_2fr]">
          <div>
            <h3 className="font-landing-heading text-xl font-black lowercase leading-tight text-[#0F172A] md:text-2xl">
              reliable chronic care<br />
              management for all.
            </h3>
            <button
              onClick={login}
              className="mt-6 cursor-pointer rounded-full border-2 border-[#0F172A] px-6 py-2.5 font-landing-nav text-sm font-semibold text-[#0F172A] transition-colors duration-200 hover:bg-[#0F172A] hover:text-white"
            >
              Get Started
            </button>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {Object.entries(footerLinks).map(([category, links]) => (
              <div key={category}>
                <h4 className="font-landing-nav text-sm font-semibold text-[#0F172A]">
                  {category}
                </h4>
                <ul className="mt-3 space-y-2">
                  {links.map((link) => (
                    <li key={link}>
                      <a
                        href="#"
                        className="font-landing-body text-sm text-[#64748B] transition-colors duration-200 hover:text-[#0F172A] cursor-pointer"
                      >
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 border-t border-[#E2E8F0] pt-6">
          <p className="font-landing-body text-xs text-[#94A3B8]">
            Nkwapa EMR — Open source multi-clinic hypertension and diabetes workflows. &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </footer>
  );
}
