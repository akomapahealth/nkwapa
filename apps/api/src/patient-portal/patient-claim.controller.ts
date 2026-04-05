import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PatientPortalService } from './patient-portal.service';
import { ClaimPatientRecordDto } from './dto/claim-record.dto';
import { RateLimit } from '../common/rate-limit.decorator';

@Controller('patients/me')
@UseGuards(JwtAuthGuard)
export class PatientClaimController {
  constructor(private readonly patientPortalService: PatientPortalService) {}

  @Post('claim-record')
  @RateLimit({ key: 'claim_record', limit: 10, windowSeconds: 600, scope: 'user-or-ip' })
  async claimRecord(
    @Body() dto: ClaimPatientRecordDto,
    @Request() req: { user: { user: { id: string } }; headers?: { 'x-request-id'?: string } },
  ) {
    return this.patientPortalService.claimPatientRecord(
      req.user.user.id,
      dto,
      req.headers?.['x-request-id'] ?? randomUUID(),
    );
  }
}
