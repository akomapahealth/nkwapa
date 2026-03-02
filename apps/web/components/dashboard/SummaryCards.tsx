"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users, Activity, FileEdit, Eye, CheckCircle } from "lucide-react";

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
        const Icon = card.icon;
        return (
          <Card key={card.title} className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{card.value}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
