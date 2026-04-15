'use client';

import { LandingAnalytics } from './LandingAnalytics';
import { LandingNav } from './LandingNav';
import { HeroSection } from './HeroSection';
import { TrustBar } from './TrustBar';
import { ProblemSolutionSection } from './ProblemSolutionSection';
import { OurStorySection } from './OurStorySection';
import { BentoFeaturesSection } from './BentoFeaturesSection';
import { WorkflowSection } from './WorkflowSection';
import { ImpactSection } from './ImpactSection';
import { TalentSection } from './TalentSection';
import { TestimonialsSection } from './TestimonialsSection';
import { PartnersSection } from './PartnersSection';
import { CtaBanner } from './CtaBanner';
import { SubscribeSection } from './SubscribeSection';
import { Footer } from './Footer';

/**
 * Marketing landing for Nkwapa EMR. Layout and section patterns informed by
 * 21st.dev / Magic MCP component inspiration (hero + bento grid + social proof).
 */
export function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingAnalytics />
      <LandingNav />
      <main>
        <HeroSection />
        <TrustBar />
        <ProblemSolutionSection />
        <OurStorySection />
        <BentoFeaturesSection />
        <WorkflowSection />
        <ImpactSection />
        <TalentSection />
        <TestimonialsSection />
        <PartnersSection />
        <CtaBanner />
        <SubscribeSection />
      </main>
      <Footer />
    </div>
  );
}
