import './globals.css';
import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://app.nkwapa.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'Nkwapa EMR',
  title: {
    default: 'Nkwapa EMR',
    template: '%s | Nkwapa EMR',
  },
  description:
    'Nkwapa EMR supports multi-clinic hypertension and diabetes workflows, clinical review, prescribing, reminders, and patient follow-up.',
  manifest: '/images/favicon/site.webmanifest',
  keywords: [
    'Nkwapa',
    'EMR',
    'electronic medical records',
    'hypertension care',
    'diabetes care',
    'clinic operations',
  ],
  authors: [{ name: 'Nkwapa' }],
  creator: 'Nkwapa',
  publisher: 'Nkwapa',
  icons: {
    icon: [
      { url: '/images/favicon/favicon.ico' },
      { url: '/images/favicon/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/images/favicon/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/images/favicon/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Nkwapa EMR',
    title: 'Nkwapa EMR',
    description:
      'Multi-clinic hypertension and diabetes workflows for clinical teams and health systems.',
    images: [
      {
        url: '/images/nkwapa-logo.png',
        width: 1049,
        height: 286,
        alt: 'Nkwapa EMR',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nkwapa EMR',
    description:
      'Multi-clinic hypertension and diabetes workflows for clinical teams and health systems.',
    images: ['/images/nkwapa-logo.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.cdnfonts.com/css/circular-std" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
