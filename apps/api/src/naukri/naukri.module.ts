import { Module } from '@nestjs/common';
import { NaukriController } from './naukri.controller';
import { NaukriService } from './naukri.service';

@Module({
  controllers: [NaukriController],
  providers: [NaukriService],
})
export class NaukriModule {}
