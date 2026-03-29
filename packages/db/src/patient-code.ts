/**
 * Patient code generator: NKP-YYYY-######
 */

import type { PrismaClient } from "@prisma/client";

export async function generatePatientCode(
  prisma: PrismaClient
): Promise<string> {
  const year = new Date().getFullYear();
  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.patientCodeSequence.upsert({
      where: { year },
      create: { year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return row.lastNumber;
  });
  return `NKP-${year}-${String(result).padStart(6, "0")}`;
}
