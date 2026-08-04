import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MetaCloudTransport,
  SimulatedTransport,
  WhatsappTransport,
  resolveWhatsappMode,
} from './whatsapp-transport';
import { WhatsappScreeningController } from './whatsapp-screening.controller';
import { WhatsappScreeningService } from './whatsapp-screening.service';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';

@Module({
  controllers: [WhatsappScreeningController, WhatsappWebhookController],
  providers: [
    WhatsappScreeningService,
    {
      provide: WhatsappTransport,
      useFactory: (config: ConfigService) =>
        resolveWhatsappMode(config) === 'meta'
          ? new MetaCloudTransport(config)
          : new SimulatedTransport(),
      inject: [ConfigService],
    },
  ],
})
export class WhatsappModule {}
