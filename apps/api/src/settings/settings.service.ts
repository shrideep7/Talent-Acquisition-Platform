import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_SCORE_WEIGHTS, type ScoreWeights } from '@mfd/shared';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

const SCORE_WEIGHTS_KEY = 'score_weights';

/** env var per weight key, e.g. SCORE_WEIGHT_SKILLS=40 overrides the shipped default. */
const WEIGHT_ENV_VARS: Record<keyof ScoreWeights, string> = {
  skills: 'SCORE_WEIGHT_SKILLS',
  experience: 'SCORE_WEIGHT_EXPERIENCE',
  keywords: 'SCORE_WEIGHT_KEYWORDS',
  education: 'SCORE_WEIGHT_EDUCATION',
  atsHealth: 'SCORE_WEIGHT_ATS_HEALTH',
};

export interface ProviderStatusDto {
  provider: string;
  configured: true;
  updatedAt: string;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Effective scoring weights: admin-stored AppSetting wins, otherwise the
   * default (DEFAULT_SCORE_WEIGHTS folded with SCORE_WEIGHT_* env overrides).
   * Consumed by the analyses module.
   */
  async getWeights(): Promise<ScoreWeights> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: SCORE_WEIGHTS_KEY },
    });
    if (setting) {
      const stored = setting.value as unknown as Partial<ScoreWeights>;
      // Guard against a malformed row — fall back per-key to the base default.
      const base = this.baseDefaultWeights();
      return {
        skills: this.numberOr(stored.skills, base.skills),
        experience: this.numberOr(stored.experience, base.experience),
        keywords: this.numberOr(stored.keywords, base.keywords),
        education: this.numberOr(stored.education, base.education),
        atsHealth: this.numberOr(stored.atsHealth, base.atsHealth),
      };
    }
    return this.baseDefaultWeights();
  }

  async updateWeights(weights: ScoreWeights, user: AuthUser): Promise<ScoreWeights> {
    const values = Object.values(weights);
    if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
      throw new BadRequestException('All weights must be finite numbers >= 0');
    }
    const sum = values.reduce((acc, v) => acc + v, 0);
    if (Math.abs(sum - 100) > 1e-6) {
      throw new BadRequestException(`Weights must sum to 100 (got ${sum})`);
    }

    const normalized: ScoreWeights = {
      skills: weights.skills,
      experience: weights.experience,
      keywords: weights.keywords,
      education: weights.education,
      atsHealth: weights.atsHealth,
    };

    await this.prisma.appSetting.upsert({
      where: { key: SCORE_WEIGHTS_KEY },
      create: { key: SCORE_WEIGHTS_KEY, value: normalized as unknown as object },
      update: { value: normalized as unknown as object },
    });

    await this.audit.log({
      userId: user.id,
      action: 'SETTINGS_UPDATED',
      entityType: 'app_setting',
      entityId: SCORE_WEIGHTS_KEY,
      detail: { weights: normalized as unknown as Record<string, unknown> },
    });

    return normalized;
  }

  /** Configured sourcing providers — never exposes the credential payload. */
  async listProviders(): Promise<ProviderStatusDto[]> {
    const credentials = await this.prisma.sourcingCredential.findMany({
      orderBy: { provider: 'asc' },
      select: { provider: true, updatedAt: true },
    });
    return credentials.map((c) => ({
      provider: c.provider,
      configured: true as const,
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async setProviderCredentials(
    provider: string,
    credentials: Record<string, string>,
    user: AuthUser,
  ): Promise<ProviderStatusDto> {
    const normalized = provider.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
      throw new BadRequestException(
        'Provider must be alphanumeric with optional underscores/hyphens (e.g. naukri_resdex)',
      );
    }
    const keys = Object.keys(credentials ?? {});
    if (keys.length === 0) {
      throw new BadRequestException('At least one credential field is required');
    }
    if (keys.some((k) => typeof credentials[k] !== 'string')) {
      throw new BadRequestException('All credential values must be strings');
    }

    const encryptedPayload = this.crypto.encrypt(JSON.stringify(credentials));
    if (!encryptedPayload) {
      throw new BadRequestException('Could not encrypt the credential payload');
    }

    const saved = await this.prisma.sourcingCredential.upsert({
      where: { provider: normalized },
      create: { provider: normalized, encryptedPayload, updatedById: user.id },
      update: { encryptedPayload, updatedById: user.id },
    });

    await this.audit.log({
      userId: user.id,
      action: 'CREDENTIALS_UPDATED',
      entityType: 'sourcing_credential',
      entityId: saved.id,
      // Field names only — never log credential values.
      detail: { provider: normalized, fields: keys },
    });

    return { provider: saved.provider, configured: true, updatedAt: saved.updatedAt.toISOString() };
  }

  /** Decrypted credentials for a provider (Phase-3 sourcing use). Null when unset. */
  async getProviderCredentials(provider: string): Promise<Record<string, string> | null> {
    const credential = await this.prisma.sourcingCredential.findUnique({
      where: { provider: provider.trim().toLowerCase() },
    });
    if (!credential) return null;

    const json = this.crypto.decrypt(credential.encryptedPayload);
    if (!json) return null;
    try {
      return JSON.parse(json) as Record<string, string>;
    } catch (err) {
      this.logger.error(
        `Stored credentials for provider "${provider}" are not valid JSON: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private baseDefaultWeights(): ScoreWeights {
    const overrides: Partial<Record<keyof ScoreWeights, number>> = {};
    for (const key of Object.keys(WEIGHT_ENV_VARS) as (keyof ScoreWeights)[]) {
      const raw = this.config.get<string>(WEIGHT_ENV_VARS[key]);
      if (raw === undefined || raw === '') continue;
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        overrides[key] = parsed;
      } else {
        this.logger.warn(`Ignoring invalid ${WEIGHT_ENV_VARS[key]}="${raw}"`);
      }
    }
    return { ...DEFAULT_SCORE_WEIGHTS, ...overrides };
  }

  private numberOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
  }
}
