import { LandingAnalytics } from './LandingAnalytics';
import { LandingHeader } from './LandingHeader';
import { ReleaseBanner } from './ReleaseBanner';
import { LandingMotion } from './LandingMotion';
import { HeroSection } from './HeroSection';
import { ProblemSection } from './ProblemSection';
import { ClinicalJourney } from './ClinicalJourney';
import { ProductShowcase } from './ProductShowcase';
import { CareTeamSection } from './CareTeamSection';
import { CapabilitiesSection } from './CapabilitiesSection';
import { ClinicalContextSection } from './ClinicalContextSection';
import { TrustSection } from './TrustSection';
import { LandingCTA } from './LandingCTA';
import { LandingFooter } from './LandingFooter';

/** The public page at `/`. Design record: docs/design/landing-page-redesign.md. */
export function LandingPage() {
  return (
    <div data-landing className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <LandingAnalytics />
      <ReleaseBanner />
      <LandingHeader />
      <LandingMotion>
        <main id="main">
          <HeroSection />
          <ProblemSection />
          <ClinicalJourney />
          <ProductShowcase />
          <CareTeamSection />
          <CapabilitiesSection />
          <ClinicalContextSection />
          <TrustSection />
          <LandingCTA />
        </main>
      </LandingMotion>
      <LandingFooter />
    </div>
  );
}
