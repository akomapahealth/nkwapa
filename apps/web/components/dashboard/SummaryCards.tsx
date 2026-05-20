'use client';

import { Users, Activity, FileEdit, Eye, CheckCircle } from 'lucide-react';
import { AppMetricCard } from '@/components/app-shell/AppMetricCard';

interface SummaryCardsProps {
  totalPatients: number;
  encountersToday: number;
  pendingDrafts: number;
  pendingReview: number;
  readyToFinalize: number;
}

export function SummaryCards({
  totalPatients,
  encountersToday,
  pendingDrafts,
  pendingReview,
  readyToFinalize,
}: SummaryCardsProps) {
  const cards = [
    {
      title: 'Patients',
      value: totalPatients,
      icon: Users,
      hint: 'Total patients linked to this clinic.',
    },
    {
      title: 'Visits today',
      value: encountersToday,
      icon: Activity,
      hint: 'Visits created for this clinic today.',
    },
    {
      title: 'Draft visits',
      value: pendingDrafts,
      icon: FileEdit,
      hint: 'Visits still being documented and not yet submitted for review.',
    },
    {
      title: 'Waiting for review',
      value: pendingReview,
      icon: Eye,
      hint: 'Visits submitted for review but not yet reviewed.',
    },
    {
      title: 'Waiting for sign-off',
      value: readyToFinalize,
      icon: CheckCircle,
      hint: 'Reviewed visits that are ready for a doctor to finalize.',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        return (
          <AppMetricCard
            key={card.title}
            title={card.title}
            value={card.value}
            hint={card.hint}
            icon={card.icon}
          />
        );
      })}
    </div>
  );
}
