// Read-only synthetic route ids. Source the guarded audit environment before running this file.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { createRequire } = require('module');
function isAuditConnection(value) {
  try {
    return new URL(value).pathname === '/nkwapa_audit';
  } catch {
    return false;
  }
}
if (
  !isAuditConnection(process.env.DATABASE_URL) ||
  !isAuditConnection(process.env.APP_DATABASE_URL)
) {
  console.error('BAD-DB');
  process.exit(1);
}
const requireProject = createRequire(path.resolve(process.cwd(), 'package.json'));
const { PrismaClient } = requireProject('@prisma/client');
const { PrismaPg } = requireProject('@prisma/adapter-pg');
const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    options: '-c app.is_system_admin=true',
  }),
});
const output = process.argv[2] || path.join(os.tmpdir(), 'nkwapa-route-audit-fixtures.json');
(async () => {
  const encounter = await db.encounter.findFirst({
    where: { clinic: { name: process.env.AUDIT_CLINIC_NAME || 'Nkwapa Clinic - Demo' } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, clinicId: true, patientId: true, status: true },
  });
  if (!encounter) throw new Error('No synthetic encounter');
  const visit = await db.patientStationVisit.findFirst({
    where: { clinicId: encounter.clinicId },
    orderBy: { queuedAt: 'desc' },
    select: { id: true },
  });
  const event = await db.screeningEvent.findFirst({
    where: { clinicId: encounter.clinicId },
    select: { id: true },
  });
  if (!visit || !event) throw new Error('Seed station workflow and screening-event fixtures first');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        clinicId: encounter.clinicId,
        patientId: encounter.patientId,
        encounterId: encounter.id,
        visitId: visit.id,
        eventId: event.id,
        encounter,
      },
      null,
      2,
    ),
  );
  console.log('Saved synthetic route fixtures.');
})()
  .catch(() => {
    console.error('Synthetic fixture lookup failed. Check the audit seed.');
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
