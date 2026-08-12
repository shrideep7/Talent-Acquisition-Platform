import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

@Module({
  imports: [EmailModule],
  controllers: [VendorsController],
  providers: [VendorsService],
})
export class VendorsModule {}
