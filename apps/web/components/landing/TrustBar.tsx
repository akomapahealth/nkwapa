'use client';

import { WifiOff, Shield, FileText, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Marquee } from './shared/Marquee';

const pillars = [
  { label: 'FHIR-friendly workflows', icon: FileText },
  { label: 'Role-based access', icon: Shield },
  { label: 'Offline queue & sync', icon: WifiOff },
  { label: 'Research exports', icon: Database },
  { label: 'Immutable audit trail', icon: Shield },
  { label: 'Multi-clinic isolation', icon: Database },
];

export function TrustBar() {
  return (
    <section className="border-y border-border bg-card/60 py-5 backdrop-blur-sm">
      <Marquee speed={35} pauseOnHover className="gap-6">
        {pillars.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <Badge
              key={pillar.label}
              variant="outline"
              className="shrink-0 cursor-default gap-2 rounded-full border-border/70 bg-background px-4 py-2 font-landing-body text-xs font-medium text-foreground shadow-sm transition-colors duration-200 hover:border-primary/30 hover:bg-primary/5"
            >
              <Icon className="h-3.5 w-3.5 text-primary" aria-hidden />
              {pillar.label}
            </Badge>
          );
        })}
      </Marquee>
    </section>
  );
}
