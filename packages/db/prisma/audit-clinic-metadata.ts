#!/usr/bin/env ts-node
/**
 * Report, and optionally repair, clinic location and zone metadata.
 *
 * Usage:
 *   npm run db:audit-clinics            # dry run: report only, changes nothing
 *   npm run db:audit-clinics -- --apply # write the fixes that can be derived unambiguously
 *
 * TENANT SAFETY: privileged system maintenance. Clinic rows are protected by RLS, and the
 * update policy is scoped to clinics the caller can access, so this connects with the system
 * admin flag set the same way the seed does. It operates across every organization by design.
 * Run it only with an approved administrative database credential. Do not copy this pattern
 * into clinic-scoped maintenance scripts.
 *
 * Every rule and every suggested value comes from `src/clinic-metadata.ts`, the same module the
 * API validates writes with and the admin UI renders badges from, so this cannot report a
 * clinic as healthy that the product would reject, or the reverse.
 *
 * Exit code is 1 when errors remain, 0 otherwise. Warnings never fail the run: a clinic with
 * no zone code is worth listing and not worth blocking a deploy over.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { evaluateClinicMetadata, type ClinicMetadataIssue } from '../src/clinic-metadata';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? '',
  // A connection option rather than a per-statement SET: pooled connections make per-statement
  // context unreliable, and the Clinic update policy is checked per row. Same reasoning as seed.ts.
  options: '-c app.is_system_admin=true',
});
const prisma = new PrismaClient({ adapter });

/** The columns a suggestion is allowed to write. Nothing else is ever auto-repaired. */
const REPAIRABLE_FIELDS = ['locationCode', 'timezone', 'zoneCode', 'countryCode'] as const;
type RepairableField = (typeof REPAIRABLE_FIELDS)[number];

function isRepairable(issue: ClinicMetadataIssue): issue is ClinicMetadataIssue & {
  field: RepairableField;
  suggestion: string;
} {
  return (
    issue.suggestion !== undefined && (REPAIRABLE_FIELDS as readonly string[]).includes(issue.field)
  );
}

const MARK = { error: '✗', warning: '⚠', info: 'ℹ', ok: '✓' };

async function main() {
  const apply = process.argv.includes('--apply');

  const organizations = await prisma.organization.findMany({
    orderBy: { name: 'asc' },
    include: { clinics: { orderBy: { name: 'asc' } } },
  });

  if (organizations.length === 0) {
    console.log('No organizations found. Run npm run db:seed first.');
    return;
  }

  if (organizations.length > 1) {
    // Two organizations both claiming the default slug is the drift this tooling exists for.
    const defaults = organizations.filter((organization) => organization.slug === 'default');
    if (defaults.length > 1) {
      console.log(
        `Note: ${defaults.length} organizations share the "default" slug. Merge them before trusting org reporting.\n`,
      );
    }
  }

  let errorCount = 0;
  let warningCount = 0;
  let clinicCount = 0;
  let repairableCount = 0;
  let repairedCount = 0;
  let blockedCount = 0;

  for (const organization of organizations) {
    console.log(`${organization.name} (${organization.slug})`);

    if (organization.clinics.length === 0) {
      console.log('  (no clinics)');
      console.log('');
      continue;
    }

    // Codes already taken in this organization, so a repair can never create a duplicate.
    const takenCodes = new Map(
      organization.clinics.map((clinic) => [clinic.locationCode, clinic.id]),
    );

    for (const clinic of organization.clinics) {
      clinicCount += 1;
      const issues = evaluateClinicMetadata({
        name: clinic.name,
        organizationId: clinic.organizationId,
        organizationTimezone: organization.timezone,
        timezone: clinic.timezone,
        locationCode: clinic.locationCode,
        zoneCode: clinic.zoneCode,
        countryCode: clinic.countryCode,
        isActive: clinic.isActive,
      });

      // Info-level notes (an inactive clinic) are shown but never counted: the issue asks for
      // inactive clinics to be visible, and a deliberate deactivation is not a data fault.
      const reportable = issues;
      if (reportable.length === 0) {
        console.log(`  ${MARK.ok} ${clinic.name}`);
        continue;
      }

      const patch: Partial<Record<RepairableField, string | null>> = {};

      for (const issue of reportable) {
        if (issue.severity === 'error') errorCount += 1;
        else if (issue.severity === 'warning') warningCount += 1;

        let note = '';
        if (isRepairable(issue)) {
          repairableCount += 1;
          if (issue.field === 'locationCode') {
            const owner = takenCodes.get(issue.suggestion);
            if (owner && owner !== clinic.id) {
              // Applying this would trade one problem for a unique-constraint failure.
              blockedCount += 1;
              note = ` [cannot auto-fix: "${issue.suggestion}" is already taken]`;
            } else {
              patch.locationCode = issue.suggestion;
              note = ` [fix: ${issue.suggestion}]`;
            }
          } else {
            patch[issue.field] = issue.suggestion;
            note = ` [fix: ${issue.suggestion}]`;
          }
        }

        const mark = MARK[issue.severity];
        console.log(
          `  ${mark} ${clinic.name.padEnd(24)} ${issue.severity.padEnd(7)} ${issue.message}${note}`,
        );
      }

      if (apply && Object.keys(patch).length > 0) {
        await prisma.clinic.update({ where: { id: clinic.id }, data: patch });
        if (patch.locationCode) {
          takenCodes.delete(clinic.locationCode);
          takenCodes.set(patch.locationCode, clinic.id);
        }
        repairedCount += Object.keys(patch).length;
        console.log(`    applied: ${Object.keys(patch).join(', ')}`);
      }
    }

    console.log('');
  }

  const summary = `${errorCount} ${plural(errorCount, 'error')}, ${warningCount} ${plural(warningCount, 'warning')} across ${clinicCount} ${plural(clinicCount, 'clinic')}.`;

  if (apply) {
    console.log(`${summary} Applied ${repairedCount} ${plural(repairedCount, 'fix', 'fixes')}.`);
    if (blockedCount > 0) {
      console.log(
        `${blockedCount} ${plural(blockedCount, 'issue')} could not be fixed automatically because the suggested location code is already in use. Choose codes for those clinics in /admin/clinics.`,
      );
    }
    console.log('Re-run without --apply to confirm what is left.');
    // Repaired rows are not re-read here; the re-run above is the confirmation.
    return;
  }

  console.log(summary);
  if (repairableCount > 0) {
    const fixable = repairableCount - blockedCount;
    if (fixable > 0) {
      console.log(
        `Re-run with --apply to fix the ${fixable} auto-fixable ${plural(fixable, 'issue')}.`,
      );
    }
    if (blockedCount > 0) {
      console.log(
        `${blockedCount} ${plural(blockedCount, 'issue')} needs a decision and cannot be auto-fixed. See docs/DATABASE_SETUP.md.`,
      );
    }
  }

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
