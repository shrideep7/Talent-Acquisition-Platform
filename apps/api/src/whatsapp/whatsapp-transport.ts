import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WhatsappMode = 'simulated' | 'meta';

export interface SendResult {
  ok: boolean;
  /** Provider message id when available. */
  externalId?: string;
  error?: string;
}

/**
 * Outbound WhatsApp channel. Two implementations:
 * - MetaCloudTransport: the real WhatsApp Cloud API (Graph API).
 * - SimulatedTransport: no external calls — the conversation runs entirely
 *   in-app so the flow can be tested before Meta business verification is
 *   done. Inbound "candidate" replies come from the simulator endpoint.
 */
export abstract class WhatsappTransport {
  abstract readonly mode: WhatsappMode;
  abstract sendText(toE164: string, text: string): Promise<SendResult>;
  /**
   * Business-initiated first message. On Meta this must be a pre-approved
   * template; falls back to plain text when no template is configured
   * (works only inside an open 24h session — fine for testing).
   */
  abstract sendInvite(toE164: string, fallbackText: string, params: string[]): Promise<SendResult>;
}

@Injectable()
export class SimulatedTransport extends WhatsappTransport {
  readonly mode: WhatsappMode = 'simulated';

  async sendText(): Promise<SendResult> {
    return { ok: true };
  }

  async sendInvite(): Promise<SendResult> {
    return { ok: true };
  }
}

@Injectable()
export class MetaCloudTransport extends WhatsappTransport {
  readonly mode: WhatsappMode = 'meta';
  private readonly logger = new Logger(MetaCloudTransport.name);
  private readonly apiVersion: string;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly templateName: string | null;
  private readonly templateLang: string;

  constructor(config: ConfigService) {
    super();
    this.apiVersion = config.get<string>('WHATSAPP_API_VERSION') ?? 'v21.0';
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID') ?? '';
    this.accessToken = config.get<string>('WHATSAPP_ACCESS_TOKEN') ?? '';
    this.templateName = config.get<string>('WHATSAPP_TEMPLATE_INVITE') || null;
    this.templateLang = config.get<string>('WHATSAPP_TEMPLATE_LANG') ?? 'en';
  }

  async sendText(toE164: string, text: string): Promise<SendResult> {
    return this.post({
      messaging_product: 'whatsapp',
      to: toE164.replace(/^\+/, ''),
      type: 'text',
      text: { body: text },
    });
  }

  async sendInvite(toE164: string, fallbackText: string, params: string[]): Promise<SendResult> {
    if (!this.templateName) {
      this.logger.warn(
        'WHATSAPP_TEMPLATE_INVITE not set — sending the invite as plain text (only delivered inside an open 24h session)',
      );
      return this.sendText(toE164, fallbackText);
    }
    return this.post({
      messaging_product: 'whatsapp',
      to: toE164.replace(/^\+/, ''),
      type: 'template',
      template: {
        name: this.templateName,
        language: { code: this.templateLang },
        components: [
          {
            type: 'body',
            parameters: params.map((text) => ({ type: 'text', text })),
          },
        ],
      },
    });
  }

  private async post(body: object): Promise<SendResult> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        const message = json.error?.message ?? `HTTP ${res.status}`;
        this.logger.error(`WhatsApp send failed: ${message}`);
        return { ok: false, error: message };
      }
      return { ok: true, externalId: json.messages?.[0]?.id };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`WhatsApp send failed: ${message}`);
      return { ok: false, error: message };
    }
  }
}

/** Explicit WHATSAPP_MODE wins; otherwise infer from whether Meta creds exist. */
export function resolveWhatsappMode(config: ConfigService): WhatsappMode {
  const explicit = config.get<string>('WHATSAPP_MODE')?.trim().toLowerCase();
  if (explicit === 'meta' || explicit === 'simulated') return explicit;
  const hasCreds =
    !!config.get<string>('WHATSAPP_ACCESS_TOKEN') &&
    !!config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
  return hasCreds ? 'meta' : 'simulated';
}
