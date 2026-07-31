import { PrismaClient } from '@prisma/client';

const SEED_DRUGS = [
  {
    name: 'Amlodipine',
    genericName: 'Amlodipine besylate',
    category: 'ANTIHYPERTENSIVE' as const,
    dosageForms: JSON.stringify(['5mg tablet', '10mg tablet']),
    contraindications: 'Severe aortic stenosis, cardiogenic shock',
  },
  {
    name: 'Lisinopril',
    genericName: 'Lisinopril',
    category: 'ANTIHYPERTENSIVE' as const,
    dosageForms: JSON.stringify(['5mg tablet', '10mg tablet', '20mg tablet']),
    contraindications: 'History of angioedema, pregnancy',
  },
  {
    name: 'Metformin',
    genericName: 'Metformin hydrochloride',
    category: 'ANTIDIABETIC' as const,
    dosageForms: JSON.stringify(['500mg tablet', '850mg tablet', '1000mg tablet']),
    contraindications: 'Severe renal impairment (eGFR <30), metabolic acidosis',
  },
  {
    name: 'Glibenclamide',
    genericName: 'Glibenclamide',
    category: 'ANTIDIABETIC' as const,
    dosageForms: JSON.stringify(['2.5mg tablet', '5mg tablet']),
    contraindications: 'Type 1 diabetes, diabetic ketoacidosis, severe hepatic impairment',
  },
  {
    name: 'Hydrochlorothiazide',
    genericName: 'Hydrochlorothiazide',
    category: 'DIURETIC' as const,
    dosageForms: JSON.stringify(['12.5mg tablet', '25mg tablet']),
    contraindications: 'Anuria, severe renal impairment, sulfonamide allergy',
  },
  {
    name: 'Atenolol',
    genericName: 'Atenolol',
    category: 'BETA_BLOCKER' as const,
    dosageForms: JSON.stringify(['25mg tablet', '50mg tablet', '100mg tablet']),
    contraindications: 'Severe bradycardia, heart block, uncontrolled heart failure',
  },
  {
    name: 'Losartan',
    genericName: 'Losartan potassium',
    category: 'ANTIHYPERTENSIVE' as const,
    dosageForms: JSON.stringify(['25mg tablet', '50mg tablet', '100mg tablet']),
    contraindications: 'Pregnancy, bilateral renal artery stenosis',
  },
  {
    name: 'Nifedipine',
    genericName: 'Nifedipine',
    category: 'ANTIHYPERTENSIVE' as const,
    dosageForms: JSON.stringify(['10mg capsule', '20mg tablet XR', '30mg tablet XR']),
    contraindications: 'Cardiogenic shock, unstable angina, severe aortic stenosis',
  },
];

/**
 * This is not a standalone script. The privileged bootstrap seed is its only caller and supplies
 * the clinic explicitly. Any future runtime or maintenance caller must establish tenant context
 * before invoking clinic-scoped writes.
 */
export async function seedDrugs(prisma: PrismaClient, clinicId: string): Promise<void> {
  for (const drug of SEED_DRUGS) {
    const existing = await prisma.drug.findFirst({
      where: { clinicId, name: drug.name },
    });
    if (!existing) {
      await prisma.drug.create({
        data: { clinicId, ...drug },
      });
    }
  }
  console.log(`Seeded ${SEED_DRUGS.length} drugs for clinic ${clinicId}`);
}
