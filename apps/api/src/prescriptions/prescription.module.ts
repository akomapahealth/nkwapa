import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { PrescriptionRepository } from "./prescription.repository";
import { PrescriptionService } from "./prescription.service";
import { PrescriptionsController } from "./prescriptions.controller";

@Module({
  imports: [forwardRef(() => AuthModule), AuditModule],
  providers: [PrescriptionRepository, PrescriptionService],
  controllers: [PrescriptionsController],
  exports: [PrescriptionService],
})
export class PrescriptionModule {}
