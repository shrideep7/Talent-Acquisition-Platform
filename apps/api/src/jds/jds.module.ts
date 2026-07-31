import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { JdsController } from './jds.controller';
import { JdsService } from './jds.service';

@Module({
  imports: [DocumentsModule],
  controllers: [JdsController],
  providers: [JdsService],
  exports: [JdsService],
})
export class JdsModule {}
