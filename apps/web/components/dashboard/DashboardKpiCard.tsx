'use client';

import { AppMetricCard } from '@/components/app-shell/AppMetricCard';
import type { LucideIcon } from 'lucide-react';

interface DashboardKpiCardProps {
  title: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
}

export function DashboardKpiCard({ title, value, hint, icon: Icon }: DashboardKpiCardProps) {
  return <AppMetricCard title={title} value={value} hint={hint} icon={Icon} />;
}
