'use client';

import { AppMetricCard, type MetricTone } from '@/components/app-shell/AppMetricCard';
import type { LucideIcon } from 'lucide-react';

interface DashboardKpiCardProps {
  title: string;
  value: number | string;
  hint?: string;
  icon?: LucideIcon;
  tone?: MetricTone;
}

export function DashboardKpiCard({ title, value, hint, icon: Icon, tone }: DashboardKpiCardProps) {
  return <AppMetricCard title={title} value={value} hint={hint} icon={Icon} tone={tone} />;
}
