"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface DashboardChartCardProps {
  title: string;
  children: React.ReactNode;
  empty?: boolean;
}

export function DashboardChartCard({ title, children, empty }: DashboardChartCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[250px] items-center justify-center rounded-md border border-dashed border-border bg-muted/30 text-sm text-muted-foreground">
            No data available
          </div>
        ) : (
          <div className="h-[250px] [@media(prefers-reduced-motion:reduce)]:min-h-[200px]">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
