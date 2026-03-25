"use client";

interface DashboardSectionHeaderProps {
  title: string;
  subtitle?: string;
}

export function DashboardSectionHeader({ title, subtitle }: DashboardSectionHeaderProps) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary/75">
        Dashboard Section
      </p>
      <h2 className="text-xl font-semibold tracking-tight font-heading">{title}</h2>
      {subtitle && (
        <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
