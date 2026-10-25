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
import type { Release } from '@/lib/release-notes';

/** The public page at `/`. Design record: docs/design/landing-page-redesign.md. */
export function LandingPage({ release }: { release: Release }) {
  // What search engines and assistants read about the product; every field is on the page too.
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Nkwapa',
    applicationCategory: 'MedicalApplication',
    operatingSystem: 'Web',
    url: 'https://nkwapa.app',
    image: 'https://nkwapa.app/og-image.jpg',
    softwareVersion: release.version,
    description:
      'An electronic medical record for hypertension and diabetes care that connects patient registration, vital signs, clinical visits, doctor review and follow-up.',
    publisher: {
      '@type': 'Organization',
      name: 'Akomapa Health Foundation',
      url: 'https://akomapa.org',
    },
  };

  return (
    <div data-landing className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <LandingAnalytics />
      <ReleaseBanner release={release} />
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
      <LandingFooter releaseVersion={release.version} />
    </div>
  );
}
