import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import { getLatestRelease } from '@/lib/release-notes';

export const metadata: Metadata = {
  title: { absolute: 'Nkwapa | Patient records and clinic workflows for chronic care' },
  description:
    'Nkwapa is an electronic medical record for hypertension and diabetes care. It connects patient registration, vital signs, clinical visits, doctor review and follow-up for clinic teams, and keeps working when the internet drops.',
  alternates: { canonical: '/' },
};

// The release banner picks up a new GitHub release within the hour, without a deploy.
export const revalidate = 3600;

export default async function Home() {
  return <LandingPage release={await getLatestRelease()} />;
}
