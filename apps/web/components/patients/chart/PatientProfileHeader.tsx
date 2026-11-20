'use client';

import { useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin } from 'lucide-react';
import styles from './patient-profile.module.css';
import { PatientContextBar } from '@/components/patients/PatientContextBar';
import type { ChartAllergySummary } from '@/lib/patient-chart';
import type { FollowUpTier } from '@nkwapa/db/follow-up-stratification';
import { avatarToneProps } from '@/lib/avatar-tone';
import { formatPersonName, type PersonNameParts } from '@/lib/person-name';

/** Identity stays visible during chart review without duplicating chart actions or focus stops. */
export function PatientProfileHeader({
  person,
  patientCode,
  sex,
  digitalAddress,
  clinicId,
  badges,
  actions,
  sexAge,
  allergies,
  tier,
}: {
  /** The full name heads the chart; the avatar and the compact bar use first and last (#342). */
  person: PersonNameParts;
  patientCode: string;
  sex: string;
  /** Shown beside the code so a follow-up caller finds the home without opening Overview (#343). */
  digitalAddress?: string | null;
  clinicId: string;
  badges: ReactNode;
  actions: ReactNode;
  /** For the pinned bar: "F · 34 y". */
  sexAge?: string | null;
  allergies?: ChartAllergySummary | null;
  /** Only for people who may see the follow-up tier. */
  tier?: FollowUpTier | null;
}) {
  const name = formatPersonName(person);
  const shortName = formatPersonName(person, 'short');
  const header = useRef<HTMLElement>(null);

  return (
    <>
      <header ref={header} className={styles.header}>
        <Link className={styles.back} href={`/clinics/${clinicId}/patients`}>
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          Back to patient search
        </Link>
        <div className={styles.identityRow}>
          <span className={styles.avatar} aria-hidden="true" {...avatarToneProps(shortName)}>
            {shortName
              .split(/\s+/)
              .filter(Boolean)
              .map((part) => part[0])
              .slice(0, 2)
              .join('')}
          </span>
          <div className={styles.identity}>
            <h1 className="type-page-title">{name}</h1>
            <div className={styles.metadata}>
              <span className="font-mono tabular-nums" translate="no">
                {patientCode}
              </span>
              <span>{sex}</span>
              {digitalAddress ? (
                <span className="inline-flex items-center gap-1 tabular-nums" translate="no">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="sr-only">Ghana Digital Address</span>
                  {digitalAddress}
                </span>
              ) : null}
            </div>
            {badges ? <div className="mt-2 flex flex-wrap gap-2">{badges}</div> : null}
          </div>
          <div role="group" aria-label="Patient chart actions" className={styles.actions}>
            {actions}
          </div>
        </div>
      </header>
      <PatientContextBar
        anchor={header}
        name={shortName}
        code={patientCode}
        sexAge={sexAge}
        allergies={allergies}
        tier={tier}
      />
    </>
  );
}
