import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { SettingsModule } from '../settings/settings.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { AtsChecksService } from './ats-checks.service';
import { ScoringService } from './scoring.service';

/**
 * Deterministic match-scoring engine: ATS format health + semantic skill
 * judgement + rule-based keyword/experience/education arithmetic.
 * ScoringService is exported for the cv-versions and sourcing modules.
 */
@Module({
  imports: [SettingsModule, DocumentsModule],
  controllers: [AnalysesController],
  providers: [AtsChecksService, ScoringService, AnalysesService],
  exports: [ScoringService, AnalysesService],
})
export class AnalysesModule {}
