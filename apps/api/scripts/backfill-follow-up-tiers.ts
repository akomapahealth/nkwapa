/**
 * Compute a follow-up tier for every patient (#336).
 *
 *   FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED=true npm run follow-up:backfill -w @nkwapa/api
 *
 * Run once after the migration, and again after any bulk load that bypassed the API (the screening
 * importer). Safe to re-run: a patient whose answer has not changed gets no new row. Prints counts
 * only, never anything about a patient.
 *
 * Connects with APP_DATABASE_URL like the API. Does not boot AppModule, which would start workers.
 */
import 'dotenv/config';
import { AuditService } from '../src/audit/audit.service';
import { FollowUpRiskService } from '../src/follow-up/follow-up-risk.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  try {
    const risk = new FollowUpRiskService(prisma, new AuditService(prisma));
    if (!risk.enabled) {
      console.error('FEATURE_FOLLOW_UP_STRATIFICATION_ENABLED is off; nothing to do.');
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(await risk.recomputeAll('BACKFILL')));
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
