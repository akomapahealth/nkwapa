import { generatePatientCode } from './patient-code';

describe('generatePatientCode', () => {
  const year = new Date().getFullYear();
  const mockUpsert = jest.fn();

  beforeEach(() => {
    mockUpsert.mockReset();
  });

  function createPrisma() {
    const tx = { patientCodeSequence: { upsert: mockUpsert } };
    return {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as Parameters<typeof generatePatientCode>[0];
  }

  it('returns NKP-YYYY-###### format', async () => {
    mockUpsert.mockResolvedValue({ year, lastNumber: 1 });
    const prisma = createPrisma();
    const code = await generatePatientCode(prisma);
    expect(code).toMatch(new RegExp(`^NKP-${year}-\\d{6}$`));
  });

  it('generates unique codes when sequence increments', async () => {
    mockUpsert
      .mockResolvedValueOnce({ year, lastNumber: 1 })
      .mockResolvedValueOnce({ year, lastNumber: 2 });

    const prisma1 = createPrisma();
    const prisma2 = createPrisma();

    const code1 = await generatePatientCode(prisma1);
    const code2 = await generatePatientCode(prisma2);

    expect(code1).not.toBe(code2);
    expect(code1).toBe(`NKP-${year}-000001`);
    expect(code2).toBe(`NKP-${year}-000002`);
  });
});
