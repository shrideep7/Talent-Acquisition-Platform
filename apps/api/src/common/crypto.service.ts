import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENC_PREFIX = 'enc:v1:';

/**
 * Application-level encryption for candidate PII (DPDP alignment).
 * AES-256-GCM with a key from ENCRYPTION_KEY (base64, 32 bytes).
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.get<string>('ENCRYPTION_KEY');
    if (raw && raw.length > 0) {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32)');
      }
      this.key = buf;
    } else if (process.env.NODE_ENV === 'production') {
      // Fail fast: never store candidate PII under a guessable derived key.
      throw new Error(
        'ENCRYPTION_KEY must be set in production (openssl rand -base64 32) — refusing to start',
      );
    } else {
      // Development fallback — deterministic key derived from JWT secret so
      // data survives restarts.
      const seed = config.get<string>('JWT_SECRET') ?? 'mfd-dev-only';
      this.key = createHash('sha256').update(`mfd-pii:${seed}`).digest();
      this.logger.warn('ENCRYPTION_KEY not set — using development-derived key');
    }
  }

  encrypt(plaintext: string | null | undefined): string | null {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  decrypt(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith(ENC_PREFIX)) return value; // legacy/plain value
    try {
      const [ivB64, tagB64, dataB64] = value.slice(ENC_PREFIX.length).split(':');
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
    } catch (err) {
      this.logger.error(`Failed to decrypt PII value: ${(err as Error).message}`);
      return null;
    }
  }

  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  emailHash(email: string | null | undefined): string | null {
    if (!email) return null;
    return this.sha256(email.trim().toLowerCase());
  }
}
