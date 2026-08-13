import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClinicScoped } from '../auth/decorators/clinic-scoped.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PERMISSIONS } from '../auth/constants/permissions';
import { ClinicScopeGuard } from '../auth/guards/clinic-scope.guard';
import { RbacGuard } from '../auth/guards/rbac.guard';
import { isApiFeatureEnabled } from '../common/feature-flags';
import { ClinicalNoteService } from './clinical-note.service';
import {
  AddClinicalNoteAddendumDto,
  ClinicalNoteDraftDto,
  UpdateClinicalNoteDraftDto,
} from './dto/clinical-note.dto';

class ClinicEncounterNoteParams {
  @IsUUID()
  clinicId!: string;

  @IsUUID()
  encounterId!: string;
}

class ClinicPatientNoteParams {
  @IsUUID()
  clinicId!: string;

  @IsUUID()
  patientId!: string;
}

type ClinicalNoteRequest = {
  user: {
    user: { id: string };
    roles: Array<{ clinicId: string | null; role: UserRole }>;
  };
  headers?: { 'x-request-id'?: string; 'user-agent'?: string };
  ip?: string;
};

@Controller('clinics/:clinicId')
@UseGuards(JwtAuthGuard, ClinicScopeGuard, RbacGuard)
export class ClinicalNoteController {
  constructor(private readonly notes: ClinicalNoteService) {}

  @Get('encounters/:encounterId/clinical-note')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_READ)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  getEncounter(
    @Param() params: ClinicEncounterNoteParams,
    @Request() request: ClinicalNoteRequest,
  ) {
    this.assertEnabled();
    return this.notes.getEncounterNote(params.clinicId, params.encounterId, this.actor(request));
  }

  @Post('encounters/:encounterId/clinical-note')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_WRITE)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  create(
    @Param() params: ClinicEncounterNoteParams,
    @Body() dto: ClinicalNoteDraftDto,
    @Request() request: ClinicalNoteRequest,
  ) {
    this.assertEnabled();
    return this.notes.createDraft(
      params.clinicId,
      params.encounterId,
      this.actor(request),
      dto,
      this.metadata(request),
    );
  }

  @Put('encounters/:encounterId/clinical-note')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_WRITE)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  update(
    @Param() params: ClinicEncounterNoteParams,
    @Body() dto: UpdateClinicalNoteDraftDto,
    @Request() request: ClinicalNoteRequest,
  ) {
    this.assertEnabled();
    return this.notes.updateDraft(
      params.clinicId,
      params.encounterId,
      this.actor(request),
      dto,
      this.metadata(request),
    );
  }

  @Post('encounters/:encounterId/clinical-note/submit')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_WRITE)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  submit(@Param() params: ClinicEncounterNoteParams, @Request() request: ClinicalNoteRequest) {
    this.assertEnabled();
    return this.notes.submit(
      params.clinicId,
      params.encounterId,
      this.actor(request),
      this.metadata(request),
    );
  }

  @Post('encounters/:encounterId/clinical-note/cosign')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_COSIGN)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  cosign(@Param() params: ClinicEncounterNoteParams, @Request() request: ClinicalNoteRequest) {
    this.assertEnabled();
    return this.notes.cosign(
      params.clinicId,
      params.encounterId,
      this.actor(request),
      this.metadata(request),
    );
  }

  @Post('encounters/:encounterId/clinical-note/addenda')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_ADDENDUM)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  addendum(
    @Param() params: ClinicEncounterNoteParams,
    @Body() dto: AddClinicalNoteAddendumDto,
    @Request() request: ClinicalNoteRequest,
  ) {
    this.assertEnabled();
    return this.notes.addAddendum(
      params.clinicId,
      params.encounterId,
      this.actor(request),
      dto,
      this.metadata(request),
    );
  }

  @Get('patients/:patientId/clinical-notes')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_READ)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  listPatient(@Param() params: ClinicPatientNoteParams, @Request() request: ClinicalNoteRequest) {
    this.assertEnabled();
    return this.notes.listPatientNotes(params.clinicId, params.patientId, this.actor(request));
  }

  @Get('clinical-notes/pending-cosign')
  @ClinicScoped({ type: 'param', paramKey: 'clinicId' })
  @RequirePermission(PERMISSIONS.CLINICAL_NOTE_COSIGN)
  @Header('Cache-Control', 'private, no-store, max-age=0')
  pending(@Param('clinicId') clinicId: string, @Request() request: ClinicalNoteRequest) {
    this.assertEnabled();
    return this.notes.pendingForDoctor(clinicId, this.actor(request));
  }

  private actor(request: ClinicalNoteRequest) {
    return { userId: request.user.user.id, roles: request.user.roles };
  }

  private metadata(request: ClinicalNoteRequest) {
    return {
      requestId: request.headers?.['x-request-id'],
      userAgent: request.headers?.['user-agent'],
      ipAddress: request.ip,
    };
  }

  private assertEnabled() {
    if (!isApiFeatureEnabled('clinicalNotes')) throw new NotFoundException();
  }
}
