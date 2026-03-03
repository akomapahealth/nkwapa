import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createHmac } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface DeIdentifiedRecord {
  researchSubjectId: string;
  sex: string;
  dobYear: number | null;
  encounterId: string;
  encounterStatus: string;
  encounterCreatedAt: string;
  // vitals
  systolicBp: number | null;
  diastolicBp: number | null;
  heartRate: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  // diabetes
  glucoseMgDl: number | null;
  glucoseType: string | null;
  hba1cPercent: number | null;
  // hypertension
  htClassification: string | null;
  htSuspected: boolean | null;
  htConfirmed: boolean | null;
  // care plan
  counselingGiven: boolean | null;
  medicationPrescribed: boolean | null;
  followUpDate: string | null;
}

@Injectable()
export class DeIdentificationService {
  constructor(private readonly prisma: PrismaService) {}

  async generateDataset(
    clinicId: string,
    exportId: string,
    format: 'csv' | 'json' = 'csv',
  ): Promise<{ filePath: string; recordCount: number }> {
    // 1. Fetch consented patients
    const consentedPatients = await this.prisma.patientConsent.findMany({
      where: {
        clinicId,
        consentType: 'RESEARCH_DEIDENTIFIED',
        status: 'GRANTED',
      },
      select: { patientId: true },
      distinct: ['patientId'],
    });

    const patientIds = consentedPatients.map((c) => c.patientId);

    if (patientIds.length === 0) {
      return this.writeEmptyDataset(exportId, format);
    }

    // 2. Fetch patients + all encounters with sub-records
    const patients = await this.prisma.patient.findMany({
      where: { id: { in: patientIds }, primaryClinicId: clinicId },
      include: {
        encounters: {
          where: { clinicId },
          include: {
            vitals: true,
            diabetesScreening: true,
            hypertensionAssessment: true,
            carePlan: true,
          },
        },
      },
    });

    // 3. De-identify
    const records: DeIdentifiedRecord[] = [];
    for (const patient of patients) {
      const researchSubjectId = this.generateResearchSubjectId(patient.id, exportId);
      const dobYear = this.generalizeDob(patient.dob, patient.sex);

      for (const enc of patient.encounters) {
        const v = enc.vitals;
        const d = enc.diabetesScreening;
        const h = enc.hypertensionAssessment;
        const cp = enc.carePlan;

        records.push({
          researchSubjectId,
          sex: patient.sex,
          dobYear,
          encounterId: enc.id,
          encounterStatus: enc.status,
          encounterCreatedAt: enc.createdAt.toISOString(),
          systolicBp: v?.systolicBp ?? null,
          diastolicBp: v?.diastolicBp ?? null,
          heartRate: v?.heartRate ?? null,
          weightKg: v?.weightKg ?? null,
          heightCm: v?.heightCm ?? null,
          bmi: v?.bmi ?? null,
          glucoseMgDl: d?.glucoseMgDl ?? null,
          glucoseType: d?.glucoseType ?? null,
          hba1cPercent: d?.hba1cPercent ?? null,
          htClassification: h?.classification ?? null,
          htSuspected: h?.suspected ?? null,
          htConfirmed: h?.confirmed ?? null,
          counselingGiven: cp?.counselingGiven ?? null,
          medicationPrescribed: cp?.medicationPrescribed ?? null,
          followUpDate: cp?.followUpDate?.toISOString() ?? null,
        });
      }
    }

    // 4. Write file
    const exportDir = process.env.EXPORT_DIR ?? './data/exports';
    fs.mkdirSync(exportDir, { recursive: true });
    const filePath = path.join(exportDir, `${exportId}.${format}`);

    if (format === 'json') {
      fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
    } else {
      const csv = this.recordsToCsv(records);
      fs.writeFileSync(filePath, csv, 'utf-8');
    }

    return { filePath, recordCount: records.length };
  }

  private generateResearchSubjectId(patientId: string, exportId: string): string {
    const hmac = createHmac('sha256', exportId);
    hmac.update(patientId);
    return hmac.digest('hex').substring(0, 16);
  }

  private generalizeDob(dob: Date | null, _sex: string): number | null {
    if (!dob) return null;
    return dob.getFullYear();
  }

  private recordsToCsv(records: DeIdentifiedRecord[]): string {
    if (records.length === 0) return '';
    const headers = Object.keys(records[0]!) as (keyof DeIdentifiedRecord)[];
    const headerLine = headers.join(',');
    const rows = records.map((r) =>
      headers.map((h) => {
        const val = r[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'string') return `"${val.replace(/"/g, '""')}"`;
        return String(val);
      }).join(','),
    );
    return [headerLine, ...rows].join('\n');
  }

  private writeEmptyDataset(
    exportId: string,
    format: 'csv' | 'json',
  ): { filePath: string; recordCount: number } {
    const exportDir = process.env.EXPORT_DIR ?? './data/exports';
    fs.mkdirSync(exportDir, { recursive: true });
    const filePath = path.join(exportDir, `${exportId}.${format}`);
    if (format === 'json') {
      fs.writeFileSync(filePath, '[]', 'utf-8');
    } else {
      fs.writeFileSync(filePath, '', 'utf-8');
    }
    return { filePath, recordCount: 0 };
  }
}
