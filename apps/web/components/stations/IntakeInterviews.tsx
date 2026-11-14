'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';

import { DiabetesInterviewForm } from '@/components/encounters/diabetes/DiabetesInterviewForm';
import { HypertensionInterviewForm } from '@/components/encounters/hypertension/HypertensionInterviewForm';
import { isUnasked } from '@/components/encounters/InterviewFlow';
import { cn } from '@/lib/utils';
import type { DiabetesScreeningRecord, VitalsRecord } from '@/lib/db';

type Interview = 'hypertension' | 'diabetes';

const CHOICES: { id: Interview; label: string }[] = [
  { id: 'hypertension', label: 'Hypertension' },
  { id: 'diabetes', label: 'Diabetes' },
];

/**
 * The intake station's interviews. The volunteer decides which to run (owner decision
 * 2026-11-12: no automatic rule); an interview that already holds answers starts chosen, so a
 * revisit never hides what was recorded.
 */
export function IntakeInterviews({
  clinicId,
  encounterId,
  patientId,
  vitals,
  hypertension,
  diabetes,
  onSaved,
}: {
  clinicId: string;
  encounterId: string;
  patientId: string;
  vitals: VitalsRecord | null;
  hypertension: Record<string, unknown> | null;
  diabetes: DiabetesScreeningRecord | null;
  onSaved: () => void;
}) {
  // The readings arrive after the form mounts, so the default follows the records until toggled.
  const recorded: Record<Interview, boolean> = {
    hypertension: Boolean(hypertension),
    // The glucose station writes this record too, so only an answered interview counts.
    diabetes: Boolean(diabetes) && !isUnasked(diabetes?.diabetesStatus as string | undefined),
  };
  const [picked, setPicked] = useState<Partial<Record<Interview, boolean>>>({});
  const isOn = (id: Interview) => picked[id] ?? recorded[id];
  // Once shown, an interview stays mounted and only hides, so switching it off keeps its answers.
  const [opened, setOpened] = useState<Set<Interview>>(() => new Set());
  const isMounted = (id: Interview) => opened.has(id) || recorded[id];
  const toggle = (id: Interview) => {
    setOpened((current) => new Set(current).add(id));
    setPicked((current) => ({ ...current, [id]: !isOn(id) }));
  };

  return (
    <section aria-labelledby="intake-interviews" className="space-y-4 border-t border-rule pt-6">
      <div className="space-y-1">
        <h2 id="intake-interviews" className="type-section-title">
          Interviews
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose the interviews to run with this patient. You can run both.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Interviews to run">
        {CHOICES.map((choice) => {
          const on = isOn(choice.id);
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(choice.id)}
              className={cn(
                'inline-flex min-h-10 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm motion-safe:transition-colors motion-safe:duration-150 hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11',
                on && 'border-primary bg-primary/10 font-medium',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-4 place-items-center rounded-sm border',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/60',
                )}
              >
                {on ? <Check className="size-3" /> : null}
              </span>
              {choice.label} interview
            </button>
          );
        })}
      </div>

      {isMounted('hypertension') ? (
        <div hidden={!isOn('hypertension')}>
          <HypertensionInterviewForm
            clinicId={clinicId}
            encounterId={encounterId}
            patientId={patientId}
            initialData={hypertension}
            vitals={
              vitals
                ? {
                    systolicBp: vitals.systolicBp ?? null,
                    diastolicBp: vitals.diastolicBp ?? null,
                    pulseBpm: vitals.pulseBpm ?? null,
                    weightKg: vitals.weightKg ?? null,
                    heightCm: vitals.heightCm ?? null,
                    bmi: vitals.bmi ?? null,
                    updatedAt: vitals.updatedAt,
                  }
                : null
            }
            onSaved={onSaved}
          />
        </div>
      ) : null}
      {isMounted('diabetes') ? (
        <div hidden={!isOn('diabetes')}>
          <DiabetesInterviewForm
            clinicId={clinicId}
            encounterId={encounterId}
            patientId={patientId}
            initialData={diabetes as Record<string, unknown> | null}
            onSaved={onSaved}
          />
        </div>
      ) : null}
    </section>
  );
}
