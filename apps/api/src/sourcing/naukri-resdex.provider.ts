import { Injectable, NotImplementedException } from '@nestjs/common';
import type { ParsedJd } from '@mfd/shared';
import { PrismaService } from '../common/prisma.service';
import type { SourcedProfile, SourcingProvider } from './provider.interface';

export const NAUKRI_RESDEX_PROVIDER_KEY = 'naukri_resdex';

/**
 * Naukri Resdex sourcing provider — Phase 3 integration stub.
 *
 * Credentials are stored (AES-256-GCM encrypted) in the SourcingCredential
 * table under provider 'naukri_resdex'; isConfigured() reports whether that
 * row exists so the UI can show "connect Naukri" vs "search Naukri".
 */
@Injectable()
export class NaukriResdexProvider implements SourcingProvider {
  readonly key = NAUKRI_RESDEX_PROVIDER_KEY;
  readonly displayName = 'Naukri Resdex';

  constructor(private readonly prisma: PrismaService) {}

  async isConfigured(): Promise<boolean> {
    const credential = await this.prisma.sourcingCredential.findUnique({
      where: { provider: this.key },
      select: { id: true },
    });
    return credential !== null;
  }

  /**
   * TODO(Phase 3) — intended flow:
   * 1. Decrypt the SourcingCredential payload (CryptoService) to obtain the
   *    Resdex API key / session credentials.
   * 2. Map ParsedJd criteria → Resdex search params:
   *    - requiredSkills (must_have first, plus aliases) → keyword query
   *    - minYearsExperience/maxYearsExperience → experience band
   *    - location → preferred location filter
   *    - noticePeriod → notice-period filter, seniorityLevel → designation
   * 3. Call the Resdex search API, paginate up to options.limit profiles.
   * 4. For each hit, download the CV file (buffer + filename) where the
   *    plan allows, and map profile fields → SourcedProfile.
   * 5. Return SourcedProfile[]; the sourcing service then funnels each
   *    cvBuffer through CandidatesService.createFromCvBuffer(source 'NAUKRI')
   *    and ScoringService.scoreCv, exactly like bulk upload.
   */
  async search(_criteria: ParsedJd, _options: { limit?: number }): Promise<SourcedProfile[]> {
    throw new NotImplementedException(
      'Naukri Resdex API integration ships in Phase 3 — use bulk upload mode',
    );
  }
}
