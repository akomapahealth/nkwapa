"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBootstrap } from "@/lib/bootstrap-context";

export default function Home() {
  const router = useRouter();
  const bootstrap = useBootstrap()?.bootstrap ?? null;
  const clinicId =
    bootstrap?.activeClinicId ?? bootstrap?.memberships?.[0]?.clinicId;

  useEffect(() => {
    if (clinicId) {
      router.replace("/dashboard");
    }
  }, [clinicId, router]);

  return (
    <div className="flex items-center justify-center min-h-[200px]">
      <p className="text-muted-foreground">Redirecting to dashboard…</p>
    </div>
  );
}
