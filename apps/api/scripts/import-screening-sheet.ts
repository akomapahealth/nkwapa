/**
 * Import the 2026-10-10 screening-day Google Sheet into Nkwapa (#204).
 *
 *   npm run screening:import -w @nkwapa/api -- --clinic-id <uuid> --date 2026-10-10 [--dir <csv dir>] [--apply] [--only V-001,V-002]
 *
 * Reads one CSV per tab (File → Download → CSV) from --dir, which defaults to the repo's ignored
 * data/screening-import/. Dry run by default: every write runs and is rolled back, so the report
 * shows exactly what --apply would do. Re-running --apply skips visits already imported.
 *
 * Connects with APP_DATABASE_URL (the nkwapa_app role, under row-level security) like the API.
 * The CSVs hold patient data: never commit them, and delete them once the import is done.
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { AuditService } from '../src/audit/audit.service';
import { ConsentService } from '../src/consents/consent.service';
import { CounsellingService } from '../src/counselling/counselling.service';
import { DiabetesScreeningService } from '../src/diabetes-screening/diabetes-screening.service';
import { EyeScreeningService } from '../src/eye-screening/eye-screening.service';
import { HypertensionAssessmentService } from '../src/hypertension-assessment/hypertension-assessment.service';
import { MedicalHistoryService } from '../src/medical-history/medical-history.service';
import { MedicationReconciliationService } from '../src/medication-reconciliation/medication-reconciliation.service';
import type { EmailStatusService } from '../src/notifications/email/email-status.service';
import type { EncounterService } from '../src/encounters/encounter.service';
import { PatientRepository } from '../src/patients/patient.repository';
import { PatientService } from '../src/patients/patient.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ClinicalMeasurementsService } from '../src/sync/clinical-measurements.service';
import { compareDerivations } from '../src/screening-import/derivations';
import { importActor, importPatient, type PatientResult } from '../src/screening-import/importer';
import { mapPatient, RowRejectedError, type PatientPlan } from '../src/screening-import/map-row';
import { loadSheet } from '../src/screening-import/read-sheet';

function args() {
  const argv = process.argv.slice(2);
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const clinicId = value('--clinic-id');
  const date = value('--date');
  if (!clinicId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error(
      'Usage: --clinic-id <uuid> --date YYYY-MM-DD [--dir <csv dir>] [--apply] [--only V-001,V-002]',
    );
    process.exit(2);
  }
  return {
    clinicId,
    date,
    dir: resolve(value('--dir') ?? resolve(__dirname, '../../../data/screening-import')),
    apply: argv.includes('--apply'),
    only: value('--only')
      ?.split(',')
      .map((v) => v.trim()),
  };
}

/**
 * The services the import calls, wired by hand. Booting AppModule would also start the queue
 * workers and schedulers, which have no business running from a one-off script against prod.
 */
function services(prisma: PrismaService) {
  const audit = new AuditService(prisma);
  const consents = new ConsentService(prisma, audit);
  return {
    prisma,
    audit,
    // shortcut: create() uses only the repository, Prisma and audit; the chart-reading dependencies are never touched here.
    patients: new PatientService(
      new PatientRepository(prisma),
      prisma,
      audit,
      undefined as unknown as EncounterService,
      consents,
      undefined as unknown as EmailStatusService,
    ),
    consents,
    measurements: new ClinicalMeasurementsService(prisma),
    hypertension: new HypertensionAssessmentService(prisma),
    diabetes: new DiabetesScreeningService(prisma),
    eye: new EyeScreeningService(prisma, audit),
    counselling: new CounsellingService(prisma, audit),
    history: new MedicalHistoryService(prisma, audit),
    medications: new MedicationReconciliationService(prisma, audit),
  };
}

async function main() {
  const opts = args();
  const sheet = loadSheet(opts.dir);
  const selected = opts.only
    ? sheet.patients.filter((p) => opts.only?.includes(p.visitId))
    : sheet.patients;

  const rejects: Array<{ visitId: string; reasons: string[] }> = [];
  const plans: PatientPlan[] = [];
  for (const p of selected) {
    try {
      plans.push(mapPatient(p, opts.date));
    } catch (error) {
      if (!(error instanceof RowRejectedError)) throw error;
      rejects.push({ visitId: error.visitId, reasons: error.reasons });
    }
  }
  const mismatches = selected.flatMap(compareDerivations);

  const prisma = new PrismaService();
  await prisma.onModuleInit();
  const s = services(prisma);
  const actor = importActor(opts.clinicId, opts.date);
  const results: PatientResult[] = [];
  try {
    for (const plan of plans) {
      try {
        results.push(
          await importPatient(s, plan, {
            clinicId: opts.clinicId,
            sessionDate: opts.date,
            actor,
            apply: opts.apply,
          }),
        );
      } catch (error) {
        if (!(error instanceof RowRejectedError)) throw error;
        rejects.push({ visitId: error.visitId, reasons: error.reasons });
      }
    }
  } finally {
    await prisma.onModuleDestroy();
  }

  report({
    ...opts,
    results,
    rejects,
    mismatches,
    orphans: sheet.orphans,
    plans,
    total: selected.length,
  });
  if (rejects.length > 0) process.exitCode = 1;
}

function report(r: {
  apply: boolean;
  date: string;
  total: number;
  plans: PatientPlan[];
  results: PatientResult[];
  rejects: Array<{ visitId: string; reasons: string[] }>;
  mismatches: ReturnType<typeof compareDerivations>;
  orphans: Array<{ visitId: string; tabs: string[] }>;
}) {
  const mode = r.apply ? 'APPLIED' : 'DRY RUN (nothing written)';
  const line = (s = '') => console.log(s);
  line(`Screening sheet import, ${r.date}: ${mode}`);
  if (!r.apply)
    line('New patient codes below are provisional: the dry run rolls the code sequence back too.');
  line();
  line('Per patient');
  for (const res of [...r.results].sort((a, b) => a.visitId.localeCompare(b.visitId))) {
    const tables = Object.entries(res.written)
      .map(([t, n]) => (n > 1 ? `${t}×${n}` : t))
      .join(', ');
    line(`  ${res.visitId}  ${res.outcome.padEnd(16)} ${res.patientCode}  ${tables || '-'}`);
    for (const w of res.warnings) line(`      warning: ${w}`);
  }
  line();
  line(`Rejected (${r.rejects.length})`);
  for (const rej of r.rejects.sort((a, b) => a.visitId.localeCompare(b.visitId))) {
    for (const reason of rej.reasons) line(`  ${rej.visitId}  ${reason}`);
  }
  if (r.orphans.length > 0) {
    line();
    line(`Station data with no patient on Check-In (${r.orphans.length})`);
    for (const o of r.orphans) line(`  ${o.visitId}  ${o.tabs.join(', ')}`);
  }
  line();
  line(`Sheet formulas vs Nkwapa (${r.mismatches.length} mismatches)`);
  for (const m of r.mismatches)
    line(`  ${m.visitId}  ${m.field}: sheet "${m.sheet}", Nkwapa ${m.nkwapa}`);

  const totals: Record<string, number> = {};
  for (const res of r.results)
    for (const [t, n] of Object.entries(res.written)) totals[t] = (totals[t] ?? 0) + n;
  const outcomes = (o: string) => r.results.filter((x) => x.outcome === o).length;
  line();
  line('Reconciliation');
  line(`  Patients on the sheet:      ${r.total}`);
  line(`  New charts:                 ${outcomes('created')}`);
  line(`  Matched existing charts:    ${outcomes('matched')}`);
  line(`  Already imported (skipped): ${outcomes('already-imported')}`);
  line(`  Rejected:                   ${r.rejects.length}`);
  line(
    `  Medicines given, kept as counselling text: ${r.plans.filter((p) => p.medicinesGiven).length}`,
  );
  line(`  Rows ${r.apply ? 'written' : 'that would be written'}:`);
  for (const [t, n] of Object.entries(totals).sort()) line(`    ${t.padEnd(26)} ${n}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
