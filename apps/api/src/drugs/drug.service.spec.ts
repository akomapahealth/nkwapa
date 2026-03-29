import { Test, TestingModule } from "@nestjs/testing";
import { DrugService } from "./drug.service";
import { DrugRepository } from "./drug.repository";
import { AuditService } from "../audit/audit.service";

const mockDrugs = [
  { id: "d-1", clinicId: "c-1", name: "Amlodipine", genericName: "Amlodipine besylate", category: "ANTIHYPERTENSIVE", isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: "d-2", clinicId: "c-1", name: "Metformin", genericName: "Metformin HCl", category: "ANTIDIABETIC", isActive: true, createdAt: new Date(), updatedAt: new Date() },
];

describe("DrugService", () => {
  let service: DrugService;
  let mockSearch: jest.Mock;

  beforeEach(async () => {
    mockSearch = jest.fn().mockResolvedValue(mockDrugs);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DrugService,
        {
          provide: DrugRepository,
          useValue: {
            search: mockSearch,
            findById: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: { logWrite: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(DrugService);
  });

  it("searches drugs by query", async () => {
    const result = await service.search("c-1", { q: "aml" });
    expect(result).toEqual(mockDrugs);
    expect(mockSearch).toHaveBeenCalledWith("c-1", { q: "aml" });
  });

  it("filters drugs by category", async () => {
    mockSearch.mockResolvedValue([mockDrugs[1]]);
    const result = await service.search("c-1", { category: "ANTIDIABETIC" as const });
    expect(result).toHaveLength(1);
    expect(mockSearch).toHaveBeenCalledWith("c-1", { category: "ANTIDIABETIC" });
  });
});
