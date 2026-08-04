import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { Public } from '../common/decorators';
import { WhatsappScreeningService } from './whatsapp-screening.service';

interface MetaWebhookPayload {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
        }[];
      };
    }[];
  }[];
}

/**
 * Meta WhatsApp Cloud API webhook. Public by necessity — authenticity comes
 * from the hub.verify_token handshake (GET) and the X-Hub-Signature-256 HMAC
 * (POST, enforced whenever WHATSAPP_APP_SECRET is configured).
 */
@ApiExcludeController()
@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly service: WhatsappScreeningService,
  ) {}

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (mode === 'subscribe' && expected && token === expected && challenge) {
      return challenge;
    }
    throw new ForbiddenException('Webhook verification failed');
  }

  @Public()
  @Post()
  @HttpCode(200)
  async receive(@Body() payload: MetaWebhookPayload, @Req() req: Request): Promise<{ ok: true }> {
    this.assertSignature(req);

    const messages =
      payload.entry?.flatMap((e) => e.changes ?? []).flatMap((c) => c.value?.messages ?? []) ?? [];
    for (const message of messages) {
      const from = message.from;
      const text =
        message.text?.body ??
        message.button?.text ??
        message.interactive?.button_reply?.title ??
        message.interactive?.list_reply?.title;
      if (!from || !text) continue;
      // Never fail the webhook — Meta retries aggressively on non-200s.
      await this.service
        .handleInboundMessage(from, text)
        .catch((err) => this.logger.error(`Inbound handling failed: ${err.message}`));
    }
    return { ok: true };
  }

  private assertSignature(req: Request): void {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret) return; // Not configured — skip (acceptable for pilots; set it in production)

    const header = req.header('x-hub-signature-256');
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!header || !rawBody) {
      throw new BadRequestException('Missing webhook signature');
    }
    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid webhook signature');
    }
  }
}
