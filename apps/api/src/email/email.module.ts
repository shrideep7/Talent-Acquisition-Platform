import { Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EmailPrescreenController } from './email-prescreen.controller';
import { EmailPrescreenService } from './email-prescreen.service';
import { MailService } from './mail.service';
import { PrescreenFormController } from './prescreen-form.controller';

@Module({
  imports: [WhatsappModule],
  controllers: [EmailPrescreenController, PrescreenFormController],
  providers: [EmailPrescreenService, MailService],
})
export class EmailModule {}
