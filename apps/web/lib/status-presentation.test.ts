import { statusLabel, statusVariant } from './status-presentation';
import { clinicalNoteStatusLabel } from './clinical-notes';

describe('status presentation', () => {
  test.each([
    ['IN_REVIEW', 'In review'],
    ['DRAFT', 'Draft'],
    ['FINALIZED', 'Finalized'],
    ['STAGE2', 'Stage 2'],
    ['UNKNOWN', 'Unknown'],
    ['PENDING_COSIGN', 'Pending cosign'],
    ['NEW_SYSTEM_STATE', 'New system state'],
    [null, 'Not recorded'],
    [undefined, 'Not recorded'],
    ['HAP note by Dr Example', 'HAP note by Dr Example'],
    ['toString', 'toString'],
  ])('renders %s as %s without changing its source value', (value, expected) => {
    expect(statusLabel(value)).toBe(expected);
  });
  it('shares clinical note copy while preserving the state contract', () => {
    expect(clinicalNoteStatusLabel('PENDING_COSIGN')).toBe(statusLabel('PENDING_COSIGN'));
    expect(statusVariant('FINALIZED')).toBe('finalized');
    expect(statusVariant('IN_REVIEW')).toBe('review');
    expect(statusVariant('STAGE2')).toBe('destructive');
    expect(statusVariant('UNKNOWN')).toBe('draft');
  });
});
