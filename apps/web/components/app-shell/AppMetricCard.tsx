"use client";

import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AppMetricCard({
  title,
  value,
  detail,
  icon: Icon,
  className,
}: {
  title: string;
  value: number | string;
  detail?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden border-border/80 bg-card/90 shadow-lg shadow-black/5",
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {title}
            </CardDescription>
            <CardTitle className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {value}
            </CardTitle>
          </div>
          {Icon ? (
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
      </CardHeader>
      {detail ? (
        <CardContent>
          <p className="text-sm text-muted-foreground">{detail}</p>
        </CardContent>
      ) : null}
    </Card>
  );
}
