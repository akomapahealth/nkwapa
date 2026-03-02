"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UserPlus, ClipboardList } from "lucide-react";

interface VolunteerDashboardProps {
  patientsRegisteredToday: number;
  encountersCreatedToday: number;
  pendingSubmissions: number;
}

export function VolunteerDashboard({
  patientsRegisteredToday,
  encountersCreatedToday,
  pendingSubmissions,
}: VolunteerDashboardProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Registered Today" value={patientsRegisteredToday} />
        <StatCard title="Encounters Today" value={encountersCreatedToday} />
        <StatCard title="Pending Submissions" value={pendingSubmissions} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild variant="outline">
            <Link href="/patients/new">
              <UserPlus className="mr-2 h-4 w-4" />
              Register Patient
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/queues">
              <ClipboardList className="mr-2 h-4 w-4" />
              View Queues
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card className="border-l-4 border-l-primary">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold text-primary">{value}</div>
      </CardContent>
    </Card>
  );
}
