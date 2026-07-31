import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { InterviewPrep as InterviewPrepRow } from '@prisma/client';
import { InterviewPrepSchema, SkillVerificationChecklistSchema } from '@mfd/shared';
import type {
  InterviewPrep,
  InterviewPrepDto,
  MatchBreakdown,
  ParsedCv,
  ParsedJd,
  SkillVerificationChecklist,
} from '@mfd/shared';
import { AnthropicService } from '../ai/anthropic.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

interface PrepContext {
  parsedJd: ParsedJd;
  parsedCv: ParsedCv;
  breakdown: MatchBreakdown;
}

@Injectable()
export class PrepService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly audit: AuditService,
  ) {}

  async generate(jdId: string, candidateId: string, user: AuthUser): Promise<InterviewPrepDto> {
    const { parsedJd, parsedCv, breakdown } = await this.loadContext(jdId, candidateId);

    const ai = await this.anthropic.structured({
      promptName: 'interview-prep',
      schema: InterviewPrepSchema,
      schemaVersion: 'v1',
      userContent: JSON.stringify({ jd: parsedJd, cv: parsedCv, breakdown }),
    });

    const row = await this.prisma.interviewPrep.create({
      data: {
        jdId,
        candidateId,
        prep: ai.data as unknown as object,
        promptVersion: ai.promptVersion,
        createdById: user.id,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'PREP_GENERATED',
      entityType: 'interview_prep',
      entityId: row.id,
      detail: { jdId, candidateId },
    });

    return this.toDto(row);
  }

  async list(jdId?: string, candidateId?: string): Promise<InterviewPrepDto[]> {
    const rows = await this.prisma.interviewPrep.findMany({
      where: {
        ...(jdId ? { jdId } : {}),
        ...(candidateId ? { candidateId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  /**
   * Verification checklist for the genuineness interview — covers the
   * UNVERIFIED_POSSIBLE skills from the latest analysis. Not persisted.
   */
  async verificationChecklist(
    jdId: string,
    candidateId: string,
  ): Promise<SkillVerificationChecklist> {
    const { parsedJd, parsedCv, breakdown } = await this.loadContext(jdId, candidateId);

    const unverifiedPossibleSkills = breakdown.skills.details
      .filter((d) => d.tier === 'UNVERIFIED_POSSIBLE')
      .map((d) => ({ skill: d.jdSkill, importance: d.importance, rationale: d.rationale }));

    if (unverifiedPossibleSkills.length === 0) return { items: [] };

    const ai = await this.anthropic.structured({
      promptName: 'verification-checklist',
      schema: SkillVerificationChecklistSchema,
      schemaVersion: 'v1',
      userContent: JSON.stringify({ jd: parsedJd, cv: parsedCv, unverifiedPossibleSkills }),
    });
    return ai.data;
  }

  private async loadContext(jdId: string, candidateId: string): Promise<PrepContext> {
    const jd = await this.prisma.jd.findFirst({ where: { id: jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');
    if (!jd.parsedCriteria) {
      throw new UnprocessableEntityException('JD has no parsed criteria — parse the JD first');
    }

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: candidateId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const docs = await this.prisma.cvDocument.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });
    const doc = docs.find((d) => d.parsedCv !== null);
    if (!doc || !doc.parsedCv) {
      throw new UnprocessableEntityException('Candidate has no parsed CV document');
    }

    const analysis = await this.prisma.matchAnalysis.findFirst({
      where: { jdId, candidateId },
      orderBy: { createdAt: 'desc' },
    });
    if (!analysis) {
      throw new UnprocessableEntityException(
        'No match analysis exists for this candidate and JD — run an analysis first',
      );
    }

    return {
      parsedJd: jd.parsedCriteria as unknown as ParsedJd,
      parsedCv: doc.parsedCv as unknown as ParsedCv,
      breakdown: analysis.breakdown as unknown as MatchBreakdown,
    };
  }

  private toDto(row: InterviewPrepRow): InterviewPrepDto {
    return {
      id: row.id,
      jdId: row.jdId,
      candidateId: row.candidateId,
      prep: row.prep as unknown as InterviewPrep,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
