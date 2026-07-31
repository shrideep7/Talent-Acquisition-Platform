import { Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.module';
import { CandidatesModule } from '../candidates/candidates.module';
import { NaukriResdexProvider } from './naukri-resdex.provider';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

/**
 * Candidate sourcing: Feature 2 fallback (bulk CV upload → ingest → score →
 * ranked list) plus the provider interface for Phase 3 integrations
 * (NaukriResdexProvider is a registered stub until its API ships).
 */
@Module({
  imports: [CandidatesModule, AnalysesModule],
  controllers: [SourcingController],
  providers: [SourcingService, NaukriResdexProvider],
  exports: [SourcingService, NaukriResdexProvider],
})
export class SourcingModule {}
