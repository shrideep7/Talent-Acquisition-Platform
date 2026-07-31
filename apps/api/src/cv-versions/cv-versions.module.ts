import { Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.module';
import { CvVersionsController } from './cv-versions.controller';
import { CvVersionsService } from './cv-versions.service';

@Module({
  imports: [AnalysesModule],
  controllers: [CvVersionsController],
  providers: [CvVersionsService],
  exports: [CvVersionsService],
})
export class CvVersionsModule {}
