import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nkwapa.app';

// Crawlers that collect pages to train AI models rather than to send people here. Only polite
// bots read robots.txt; the API's default rate limit covers the rest.
const AI_TRAINING_CRAWLERS = [
  'GPTBot',
  'CCBot',
  'ClaudeBot',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'Bytespider',
  'meta-externalagent',
  'Amazonbot',
  'PerplexityBot',
  'Diffbot',
  'omgili',
  'cohere-ai',
];

// Workspace routes redirect to sign-in, so there is nothing private to fence off here. Blocking
// paths would also hide /og-image.jpg and /_next assets from link-preview crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_TRAINING_CRAWLERS, disallow: '/' },
      { userAgent: '*', allow: '/' },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
