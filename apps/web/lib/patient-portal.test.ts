import {
  fetchPatientTrends,
  fetchStaffPatientTrends,
  type PatientTrendsResponse,
} from "@/lib/patient-portal";

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

describe("patient portal trend fetch helpers", () => {
  const getToken = jest.fn();

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000";
    getToken.mockResolvedValue("token-123");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(trendsResponse),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("appends the active range to patient trend requests", async () => {
    await fetchPatientTrends("clinic-1", getToken, {
      from: "2026-03-01T00:00:00.000Z",
      to: "2026-03-31T23:59:59.999Z",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/patients/me/trends?from=2026-03-01T00%3A00%3A00.000Z&to=2026-03-31T23%3A59%3A59.999Z",
      expect.any(Object)
    );

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("X-Clinic-Id")).toBe("clinic-1");
  });

  it("uses the staff patient trend path with clinic header scoping", async () => {
    await fetchStaffPatientTrends("patient-7", "clinic-9", getToken, {
      from: "2026-03-15T00:00:00.000Z",
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/patients/patient-7/trends?from=2026-03-15T00%3A00%3A00.000Z",
      expect.any(Object)
    );

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
    expect(headers.get("X-Clinic-Id")).toBe("clinic-9");
  });
});
