"use client";

import { AppMetricCard } from "@/components/app-shell/AppMetricCard";
import type { LucideIcon } from "lucide-react";

interface DashboardKpiCardProps {
  title: string;
  value: number | string;
  icon?: LucideIcon;
}

export function DashboardKpiCard({ title, value, icon: Icon }: DashboardKpiCardProps) {
  return <AppMetricCard title={title} value={value} icon={Icon} />;
}
