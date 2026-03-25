/**
 * Landing page image configuration.
 * Replace placeholder URLs with final asset paths when ready.
 * Supports both external URLs (Unsplash, etc.) and local /public paths.
 */

export const landingImages = {
  hero: {
    background:
      "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1920&q=80",
    alt: "Healthcare professional in clinic setting",
  },
  features: [
    {
      src: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800&q=80",
      alt: "Offline medical documentation",
    },
    {
      src: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&q=80",
      alt: "Patient care and vitals monitoring",
    },
    {
      src: "https://images.unsplash.com/photo-1581594549595-35f6edc7b762?w=800&q=80",
      alt: "Multi-clinic healthcare network",
    },
    {
      src: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80",
      alt: "Secure medical records",
    },
  ],
  testimonials: [
    {
      src: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=200&q=80",
      alt: "Dr. Sarah M.",
    },
    {
      src: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=200&q=80",
      alt: "James K.",
    },
    {
      src: "https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=200&q=80",
      alt: "Grace A.",
    },
  ],
  cta: {
    background:
      "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?w=1920&q=80",
    alt: "Modern clinic interior",
  },
} as const;
