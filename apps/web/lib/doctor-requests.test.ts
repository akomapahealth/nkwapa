import { doctorRequestLabel, type DoctorRequest } from './doctor-requests';

const base: DoctorRequest = {
  id: 'r1',
  urgency: 'NOW',
  reason: 'HIGH_BP',
  auto: false,
  stationVisitId: 'v1',
  claimedBy: null,
  claimedAt: null,
  open: true,
};

it('says who is on it, or that a doctor is still needed', () => {
  expect(doctorRequestLabel(base)).toBe('Doctor needed now');
  expect(doctorRequestLabel({ ...base, urgency: 'BEFORE_LEAVING' })).toBe('Doctor requested');
  const taken = { ...base, claimedBy: { id: 'd1', displayName: 'Dr Mensah' } };
  expect(doctorRequestLabel(taken, 'someone')).toBe('Dr Mensah on it');
  expect(doctorRequestLabel(taken, 'd1')).toBe("You're on it");
});
