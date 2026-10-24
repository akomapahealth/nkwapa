import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: { absolute: 'Nkwapa | Patient records and clinic workflows for chronic care' },
  description:
    'Nkwapa is an electronic medical record for hypertension and diabetes care. It connects patient registration, vital signs, clinical visits, doctor review and follow-up for clinic teams, and keeps working when the internet drops.',
};

export default function Home() {
  return <LandingPage />;
}
