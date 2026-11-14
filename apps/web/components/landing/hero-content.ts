/**
 * The landing hero's words and photograph, in one place, because two things draw them: the hero
 * (HeroSection) and the link-preview card (app/opengraph-image.tsx), which is rendered from these
 * values at every build. Edit the hero here and the card follows; nobody re-captures a screenshot.
 */
export const HERO_HEADLINE = 'One record for every visit, even offline.';

export const HERO_LEDE =
  'An electronic medical record for hypertension and diabetes care, from registration to doctor review and follow-up.';

export const HERO_PHOTO = {
  src: '/images/Akomapa-17.jpg',
  alt: "A volunteer in an Akomapa shirt writes down a reading while a woman's blood pressure is taken at a community screening.",
  /** The wide-screen crop: mirrors HeroSection's `lg:object-[22%_30%]`, so change both. */
  focusX: 0.22,
  focusY: 0.3,
} as const;
