import { DrugCategory } from "@prisma/client";

export interface UpdateDrugDto {
  name?: string;
  genericName?: string;
  category?: DrugCategory;
  dosageForms?: string;
  contraindications?: string;
  isActive?: boolean;
}
