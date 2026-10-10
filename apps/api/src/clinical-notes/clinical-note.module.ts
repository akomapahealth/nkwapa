import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ClinicalNoteController } from './clinical-note.controller';
import { ClinicalNoteRepository } from './clinical-note.repository';
import { ClinicalNoteService } from './clinical-note.service';

@Module({
  imports: [AuthModule],
  controllers: [ClinicalNoteController],
  providers: [ClinicalNoteRepository, ClinicalNoteService],
  exports: [ClinicalNoteService],
})
export class ClinicalNoteModule {}
