import { clinicalNoteStatusLabel } from './clinical-notes';

describe('clinical note presentation', () => {
  it.each([
    ['DRAFT', 'Draft'],
    ['PENDING_COSIGN', 'Pending cosign'],
    ['COSIGNED', 'Cosigned'],
    ['AMENDED', 'Amended'],
  ] as const)('renders %s as descriptive text', (status, label) => {
    expect(clinicalNoteStatusLabel(status)).toBe(label);
  });
});
