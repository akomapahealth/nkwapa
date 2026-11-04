// Browser-only synthetic evidence. No writes, no database or permission changes.
const person = {
  id: 'synthetic-volunteer',
  displayName: 'Ama Example',
  email: 'ama.example@nkwapa.local',
  phoneE164: null,
  notes: 'Synthetic evidence fixture.',
  isActive: true,
  linkedUserId: null,
};
const event = {
  id: 'synthetic-event',
  title: 'Community screening',
  startsAt: '2026-11-14T08:00:00Z',
  endsAt: '2026-11-14T13:00:00Z',
  siteName: 'Example community hall',
  siteAddress: 'Synthetic location',
  notes: 'Meet at the registration desk.',
  status: 'SCHEDULED',
  cancelReason: null,
  rosteredCount: 1,
};
const run = {
  id: 'synthetic-export',
  clinicId: 'synthetic-clinic',
  runKey: 'rx-synthetic-example',
  trigger: 'MANUAL',
  scheduleId: null,
  status: 'PENDING_APPROVAL',
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  datasetVersion: 1,
  policyVersionSnapshot: 'v1',
  rejectionReason: null,
  failureReason: null,
  skipReason: null,
  filePath: null,
  fileFormat: 'zip',
  recordCount: null,
  rowCounts: {},
  consentedSubjectCount: 2,
  revokedSinceLastCount: null,
  contentSha256: null,
  changes: null,
  artifactSha256: null,
  artifactSizeBytes: null,
  storageProvider: null,
  storagePath: null,
  storageRef: null,
  storageUrl: null,
  requestedAt: '2026-11-01T09:00:00Z',
  startedAt: null,
  approvedAt: null,
  syncedAt: null,
  completedAt: null,
  downloadAvailable: false,
  requestedBy: { id: 'synthetic-requester', displayName: 'Example researcher' },
  approvedBy: null,
};
function responseFor(url) {
  const pathname = new URL(url).pathname;
  if (/\/clinics\/[^/]+\/volunteers$/.test(pathname)) return { items: [person] };
  if (/\/clinics\/[^/]+\/screening-events$/.test(pathname))
    return { timezone: 'Africa/Accra', items: [event] };
  if (/\/clinics\/[^/]+\/screening-events\/synthetic-event$/.test(pathname))
    return {
      event,
      timezone: 'Africa/Accra',
      emailConfigured: true,
      roster: [
        {
          id: 'synthetic-row',
          status: 'ASSIGNED',
          lastNotifiedAt: null,
          notifiedForCurrentDetails: false,
          volunteerContact: person,
          delivery: null,
        },
      ],
    };
  if (/\/clinics\/[^/]+\/research\/exports$/.test(pathname))
    return { items: [run], hasMore: false };
  if (/\/clinics\/[^/]+\/research\/overview$/.test(pathname))
    return {
      researchEnabled: true,
      approvalRequired: true,
      timezone: 'Africa/Accra',
      consentedSubjects: 2,
      minSubjects: 2,
      storage: { destinations: ['LOCAL'], defaultDestination: 'LOCAL' },
      counts: { PENDING_APPROVAL: 1 },
      lastCompleted: null,
      nextRun: null,
      attention: { runs: [run], schedules: [] },
    };
  if (/\/clinics\/[^/]+\/research\/schedules$/.test(pathname))
    return {
      items: [],
      timezone: 'Africa/Accra',
      defaultReviewMonths: 3,
      destinations: ['LOCAL'],
      defaultDestination: 'LOCAL',
    };
  return undefined;
}
module.exports = { responseFor };
