import {
  cancelStaffAppointment,
  completeStaffAppointment,
  fetchAppointmentStaffOptions,
  fetchPatientTrends,
  fetchStaffAppointments,
  fetchStaffPatientTrends,
  markStaffAppointmentNoShow,
  rescheduleStaffAppointment,
  type AppointmentStaffOptionsResponse,
  type PatientTrendsResponse,
  type StaffAppointmentRecord,
  type StaffAppointmentsResponse,
} from '@/lib/patient-portal';

const trendsResponse: PatientTrendsResponse = {
  bp: [],
  glucose: [],
  followUp: {
    requested: 0,
    confirmed: 0,
    completed: 0,
    noShow: 0,
    closed: 0,
  },
};

const appointmentsResponse: StaffAppointmentsResponse = {
  range: { from: '2026-03-26', to: '2026-03-26' },
  timezone: 'Africa/Accra',
  summary: {
    total: 0,
    confirmed: 0,
    cancelled: 0,
    completed: 0,
    noShow: 0,
  },
  items: [],
};

const staffOptionsResponse: AppointmentStaffOptionsResponse = {
  doctors: [],
  volunteers: [],
};

const appointmentRecord: StaffAppointmentRecord = {
  id: 'appointment-1',
  clinicId: 'clinic-2',
  patientId: 'patient-1',
  startsAt: '2026-03-26T14:00:00.000Z',
  endsAt: '2026-03-26T14:30:00.000Z',
  status: 'CONFIRMED',
  linkedRequestId: 'appt-req-1',
  patient: {
    id: 'patient-1',
    patientCode: 'NKP-2026-000001',
    firstName: 'Ama',
    lastName: 'Mensah',
    displayName: 'Ama Mensah',
  },
  assignedDoctor: null,
  assignedVolunteer: null,
  notes: null,
  createdAt: '2026-03-21T09:00:00.000Z',
  updatedAt: '2026-03-21T09:00:00.000Z',
};

describe('patient portal trend fetch helpers', () => {
  const getToken = jest.fn();

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000';
    getToken.mockResolvedValue('token-123');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(trendsResponse),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('appends the active range to patient trend requests', async () => {
    await fetchPatientTrends('clinic-1', getToken, {
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-31T23:59:59.999Z',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/patients/me/trends?from=2026-03-01T00%3A00%3A00.000Z&to=2026-03-31T23%3A59%3A59.999Z',
      expect.any(Object),
    );

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('X-Clinic-Id')).toBe('clinic-1');
  });

  it('uses the staff patient trend path with clinic header scoping', async () => {
    await fetchStaffPatientTrends('patient-7', 'clinic-9', getToken, {
      from: '2026-03-15T00:00:00.000Z',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/patients/patient-7/trends?clinicId=clinic-9&from=2026-03-15T00%3A00%3A00.000Z',
      expect.any(Object),
    );

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('X-Clinic-Id')).toBe('clinic-9');
  });

  it('builds staff appointment schedule queries with clinic header scoping', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(appointmentsResponse),
    } as unknown as Response);

    await fetchStaffAppointments('clinic-2', getToken, {
      from: '2026-03-26',
      to: '2026-03-27',
      status: 'CONFIRMED',
      assignedDoctorId: 'doctor-1',
      assignedVolunteerId: 'volunteer-1',
      patientSearch: 'Ama Mensah',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/clinics/clinic-2/appointments?from=2026-03-26&to=2026-03-27&status=CONFIRMED&assignedDoctorId=doctor-1&assignedVolunteerId=volunteer-1&patientSearch=Ama+Mensah',
      expect.any(Object),
    );

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('X-Clinic-Id')).toBe('clinic-2');
  });

  it('loads appointment staff options with active clinic scoping', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(staffOptionsResponse),
    } as unknown as Response);

    await fetchAppointmentStaffOptions('clinic-2', getToken);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/clinics/clinic-2/appointments/staff-options',
      expect.any(Object),
    );

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('X-Clinic-Id')).toBe('clinic-2');
  });

  it('reschedules staff appointments with active clinic scoping', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(appointmentRecord),
    } as unknown as Response);

    await rescheduleStaffAppointment('clinic-2', 'appointment-1', getToken, {
      startsAt: '2026-03-27T15:00:00.000Z',
      endsAt: '2026-03-27T15:45:00.000Z',
      notes: 'Updated slot',
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:4000/clinics/clinic-2/appointments/appointment-1/reschedule',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          startsAt: '2026-03-27T15:00:00.000Z',
          endsAt: '2026-03-27T15:45:00.000Z',
          notes: 'Updated slot',
        }),
      }),
    );
    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer token-123');
    expect(headers.get('X-Clinic-Id')).toBe('clinic-2');
  });

  it('cancels, completes, and marks no-show appointments with clinic-scoped endpoints', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(appointmentRecord),
    } as unknown as Response);

    await cancelStaffAppointment('clinic-2', 'appointment-1', getToken, {
      reason: 'Patient requested cancellation',
    });
    await completeStaffAppointment('clinic-2', 'appointment-1', getToken, {
      notes: 'Visit completed',
    });
    await markStaffAppointmentNoShow('clinic-2', 'appointment-1', getToken, {
      reason: 'Patient did not arrive',
    });

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:4000/clinics/clinic-2/appointments/appointment-1/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Patient requested cancellation' }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:4000/clinics/clinic-2/appointments/appointment-1/complete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ notes: 'Visit completed' }),
      }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:4000/clinics/clinic-2/appointments/appointment-1/no-show',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'Patient did not arrive' }),
      }),
    );

    for (const [, init] of (global.fetch as jest.Mock).mock.calls) {
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get('Authorization')).toBe('Bearer token-123');
      expect(headers.get('X-Clinic-Id')).toBe('clinic-2');
    }
  });
});
