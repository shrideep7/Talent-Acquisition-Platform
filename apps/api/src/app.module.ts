import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from './ai/ai.module';
import { AnalysesModule } from './analyses/analyses.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CandidatesModule } from './candidates/candidates.module';
import { CommonModule } from './common/common.module';
import { CvVersionsModule } from './cv-versions/cv-versions.module';
import { DocumentsModule } from './documents/documents.module';
import { EmailModule } from './email/email.module';
import { ExportModule } from './export/export.module';
import { JdsModule } from './jds/jds.module';
import { NaukriModule } from './naukri/naukri.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { PrepModule } from './prep/prep.module';
import { SettingsModule } from './settings/settings.module';
import { SkillsModule } from './skills/skills.module';
import { SourcingModule } from './sourcing/sourcing.module';
import { VendorsModule } from './vendors/vendors.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    AiModule,
    AuthModule,
    DocumentsModule,
    JdsModule,
    CandidatesModule,
    AnalysesModule,
    CvVersionsModule,
    ExportModule,
    PrepModule,
    NaukriModule,
    SkillsModule,
    PipelineModule,
    SourcingModule,
    WhatsappModule,
    EmailModule,
    VendorsModule,
    SettingsModule,
    AuditModule,
  ],
})
export class AppModule {}
