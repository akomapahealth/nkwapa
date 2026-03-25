"use client";

import { Users, Activity, FileEdit, Eye, CheckCircle } from "lucide-react";
import { AppMetricCard } from "@/components/app-shell/AppMetricCard";

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
      title: "Total Patients",
      value: totalPatients,
      icon: Users,
    },
    {
      title: "Encounters Today",
      value: encountersToday,
      icon: Activity,
    },
    {
      title: "Pending Drafts",
      value: pendingDrafts,
      icon: FileEdit,
    },
    {
      title: "Pending Review",
      value: pendingReview,
      icon: Eye,
    },
    {
      title: "Ready to Finalize",
      value: readyToFinalize,
      icon: CheckCircle,
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
            icon={card.icon}
          />
        );
      })}
    </div>
  );
}
