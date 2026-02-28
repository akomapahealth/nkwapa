"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

export default function EncountersListPage() {
  const params = useParams();
  const clinicId = params.clinicId as string;

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold">Encounter Queue</h1>
        <p className="text-sm text-muted-foreground">
          Queue view coming soon. Start a check-in from a patient profile.
        </p>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href={`/clinics/${clinicId}/patients`}>
            <FileText className="mr-2 h-4 w-4" />
            Go to Patients
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
