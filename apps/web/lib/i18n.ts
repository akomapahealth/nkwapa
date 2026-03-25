/**
 * Landing page localization.
 * Replace with next-intl or similar for full i18n.
 */

export type Locale = "en" | "fr";

export const defaultLocale: Locale = "en";

export const landingTranslations: Record<
  Locale,
  Record<string, string>
> = {
  en: {
    "nav.signIn": "Sign In",
    "hero.title": "Multi-clinic EMR for Hypertension and Diabetes",
    "hero.subtitle":
      "Offline-first PWA with sync, role-based access, and audit-by-default. Built for clinics that need reliable, secure patient management.",
    "hero.ctaPrimary": "Sign In",
    "hero.ctaSecondary": "Get Started",
    "features.title": "Built for clinical workflows",
    "features.subtitle":
      "Everything you need to manage hypertension and diabetes care across your clinics.",
    "testimonials.title": "Trusted by clinic teams",
    "testimonials.subtitle": "See what healthcare professionals say about Nkwapa.",
    "cta.title": "Ready to streamline your clinic?",
    "cta.subtitle":
      "Sign in to access your dashboard and start managing patients with Nkwapa EMR.",
    "cta.button": "Sign In",
    "footer.tagline": "Nkwapa EMR — Multi-clinic hypertension and diabetes workflows",
  },
  fr: {
    "nav.signIn": "Connexion",
    "hero.title": "EMR multi-clinique pour l'hypertension et le diabète",
    "hero.subtitle":
      "PWA hors ligne avec synchronisation, accès par rôle et audit par défaut. Conçu pour les cliniques qui ont besoin d'une gestion fiable et sécurisée des patients.",
    "hero.ctaPrimary": "Connexion",
    "hero.ctaSecondary": "Commencer",
    "features.title": "Conçu pour les flux cliniques",
    "features.subtitle":
      "Tout ce dont vous avez besoin pour gérer les soins de l'hypertension et du diabète dans vos cliniques.",
    "testimonials.title": "Approuvé par les équipes cliniques",
    "testimonials.subtitle": "Découvrez ce que les professionnels de santé disent de Nkwapa.",
    "cta.title": "Prêt à rationaliser votre clinique ?",
    "cta.subtitle":
      "Connectez-vous pour accéder à votre tableau de bord et commencer à gérer les patients avec Nkwapa EMR.",
    "cta.button": "Connexion",
    "footer.tagline": "Nkwapa EMR — Flux hypertension et diabète multi-cliniques",
  },
};

export function t(locale: Locale, key: string): string {
  return landingTranslations[locale]?.[key] ?? landingTranslations.en[key] ?? key;
}
