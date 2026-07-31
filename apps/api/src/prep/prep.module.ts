import { Module } from '@nestjs/common';
import { PrepController } from './prep.controller';
import { PrepService } from './prep.service';

@Module({
  controllers: [PrepController],
  providers: [PrepService],
})
export class PrepModule {}
