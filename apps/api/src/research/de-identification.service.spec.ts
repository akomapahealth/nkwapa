import { BadRequestException } from "@nestjs/common";
import { DeIdentificationService } from "./de-identification.service";

describe("DeIdentificationService", () => {
  let service: DeIdentificationService;

  beforeEach(() => {
    service = new DeIdentificationService();
    process.env.RESEARCH_HMAC_KEY = "test-research-key";
  });

  afterEach(() => {
    delete process.env.RESEARCH_HMAC_KEY;
  });

  it("derives stable clinic-scoped keys", () => {
    const first = service.patientKey("clinic-a", "patient-1");
    const second = service.patientKey("clinic-a", "patient-1");
    const differentClinic = service.patientKey("clinic-b", "patient-1");

    expect(first).toHaveLength(32);
    expect(first).toBe(second);
    expect(first).not.toBe(differentClinic);
  });

  it("rounds timestamps down to 15-minute buckets", () => {
    const rounded = service.roundTimestamp(new Date("2026-03-21T14:29:59.000Z"));
    expect(rounded).toBe("2026-03-21T14:15:00.000Z");
  });

  it("escapes CSV values and keeps fixed headers", () => {
    const csv = service.csvFromRows(["name", "value"], [
      { name: 'A "quoted" row', value: 42 },
    ]);

    expect(csv).toContain('name,value');
    expect(csv).toContain('"A ""quoted"" row",42');
  });

  it("requires the research hmac key", () => {
    delete process.env.RESEARCH_HMAC_KEY;

    expect(() => service.patientKey("clinic-a", "patient-1")).toThrow(
      BadRequestException
    );
  });
});
