import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NaukriSearchCriteriaSchema } from '@mfd/shared';
import type { NaukriSearchDto, ParsedJd } from '@mfd/shared';
import { LlmService } from '../ai/llm.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

export interface ExtractNaukriSearchInput {
  jdId?: string;
  rawText?: string;
  /** Bypass the LLM cache and re-extract (the "Regenerate" button). */
  refresh?: boolean;
}

/**
 * Extracts Naukri Resdex search-filter values from a JD so recruiters can
 * copy-paste them into Resdex's search form. Nothing is persisted — the
 * LLM cache makes repeat lookups for the same JD instant, and re-extraction
 * is explicit via `refresh`.
 */
@Injectable()
export class NaukriService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
  ) {}

  async extract(input: ExtractNaukriSearchInput, user: AuthUser): Promise<NaukriSearchDto> {
    let jdId: string | null = null;
    let jdTitle: string | null = null;
    let jdText: string;
    let parsedCriteria: ParsedJd | null = null;

    if (input.jdId) {
      const jd = await this.prisma.jd.findFirst({ where: { id: input.jdId, deletedAt: null } });
      if (!jd) throw new NotFoundException('JD not found');
      jdId = jd.id;
      jdTitle = jd.title;
      jdText = jd.rawText;
      parsedCriteria = jd.parsedCriteria ? (jd.parsedCriteria as unknown as ParsedJd) : null;
    } else if (input.rawText && input.rawText.trim().length > 0) {
      jdText = input.rawText.trim();
    } else {
      throw new BadRequestException("Provide either 'jdId' or a non-empty 'rawText'");
    }

    const result = await this.llm.structured({
      promptName: 'naukri-search',
      schema: NaukriSearchCriteriaSchema,
      schemaVersion: 'v1',
      userContent: JSON.stringify({ jdText, parsedCriteria }),
      noCache: input.refresh === true,
    });

    await this.audit.log({
      userId: user.id,
      action: 'NAUKRI_SEARCH_GENERATED',
      entityType: 'jd',
      entityId: jdId,
      detail: {
        jdTitle,
        source: jdId ? 'jd' : 'rawText',
        cached: result.cached,
        refresh: input.refresh === true,
      },
    });

    return { criteria: result.data, jdId, jdTitle, cached: result.cached };
  }
}
