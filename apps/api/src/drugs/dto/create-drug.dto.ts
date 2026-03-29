import { DrugCategory } from "@prisma/client";

export interface CreateDrugDto {
  name: string;
  genericName?: string;
  category?: DrugCategory;
  dosageForms?: string;
  contraindications?: string;
}
