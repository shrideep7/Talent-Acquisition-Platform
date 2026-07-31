import { Global, Module } from '@nestjs/common';
import { DocumentParserService } from './document-parser.service';

/** Document text extraction + ATS format signals. Service-only, no controller. */
@Global()
@Module({
  providers: [DocumentParserService],
  exports: [DocumentParserService],
})
export class DocumentsModule {}
