import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export type EmailMode = 'simulated' | 'smtp';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Outbound email over SMTP (AWS SES SMTP credentials in production).
 * Simulated mode — the default when no SMTP credentials are configured —
 * sends nothing; the composed email is still recorded on the conversation
 * so the flow can be exercised end-to-end without an SES account.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  readonly mode: EmailMode;
  readonly from: string;
  private readonly fromName: string;
  private readonly replyTo: string | null;
  private readonly transporter: Transporter | null;

  constructor(config: ConfigService) {
    const host = config.get<string>('SES_SMTP_HOST')?.trim();
    const user = config.get<string>('SES_SMTP_USER')?.trim();
    const pass = config.get<string>('SES_SMTP_PASS')?.trim();
    const explicit = config.get<string>('EMAIL_MODE')?.trim().toLowerCase();

    this.from = config.get<string>('MAIL_FROM')?.trim() || 'hiring@metafordata.com';
    this.fromName = config.get<string>('MAIL_FROM_NAME')?.trim() || 'MFD Talent';
    this.replyTo = config.get<string>('MAIL_REPLY_TO')?.trim() || null;

    const hasCreds = !!host && !!user && !!pass;
    this.mode = explicit === 'smtp' || (explicit !== 'simulated' && hasCreds) ? 'smtp' : 'simulated';

    if (this.mode === 'smtp') {
      const port = parseInt(config.get<string>('SES_SMTP_PORT') ?? '587', 10);
      this.transporter = createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      this.logger.log(`Email channel: SMTP via ${host}:${port} as ${this.from}`);
    } else {
      this.transporter = null;
      this.logger.warn('Email channel: simulated mode (no SES SMTP credentials configured)');
    }
  }

  async send(mail: OutgoingMail): Promise<MailSendResult> {
    if (!this.transporter) {
      this.logger.log(`[simulated] email to ${mail.to}: ${mail.subject}`);
      return { ok: true };
    }
    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.from}>`,
        replyTo: this.replyTo ?? this.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      return { ok: true };
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Email send failed to ${mail.to}: ${message}`);
      return { ok: false, error: message };
    }
  }
}
