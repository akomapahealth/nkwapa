import { Module, forwardRef } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { PatientModule } from "../patients/patient.module";
import { PatientPortalModule } from "../patient-portal/patient-portal.module";
import { ClinicService } from "./clinic.service";
import { ClinicsController } from "./clinics.controller";
import { ClinicsPatientsController } from "./clinics-patients.controller";
import { ClinicsResearchController } from "./clinics-research.controller";
import { ClinicsAdminController } from "./clinics-admin.controller";

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule), forwardRef(() => PatientModule), PatientPortalModule],
  providers: [ClinicService],
  controllers: [
    ClinicsController,
    ClinicsPatientsController,
    ClinicsResearchController,
    ClinicsAdminController,
  ],
  exports: [ClinicService],
})
export class ClinicModule {}
