import { Module, forwardRef } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { DrugRepository } from "./drug.repository";
import { DrugService } from "./drug.service";
import { DrugsController } from "./drugs.controller";

@Module({
  imports: [forwardRef(() => AuthModule), AuditModule],
  providers: [DrugRepository, DrugService],
  controllers: [DrugsController],
  exports: [DrugService],
})
export class DrugModule {}
