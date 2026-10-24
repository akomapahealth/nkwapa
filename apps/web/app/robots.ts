import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nkwapa.app';

// Workspace routes redirect to sign-in, so there is nothing private to fence off here. Blocking
// paths would also hide /og-image.jpg and /_next assets from link-preview crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
