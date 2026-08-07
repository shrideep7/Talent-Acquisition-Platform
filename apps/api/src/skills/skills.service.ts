import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { VerifiedSkill } from '@prisma/client';
import type { AuditAction, VerifiedSkillDto } from '@mfd/shared';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

export type SkillDecision = 'ACCEPTED' | 'REJECTED' | 'VERIFIED';

const DECISION_AUDIT_ACTION: Record<SkillDecision, AuditAction> = {
  ACCEPTED: 'SKILL_ACCEPTED',
  REJECTED: 'SKILL_REJECTED',
  VERIFIED: 'SKILL_VERIFIED',
};

export interface CreateVerifiedSkillInput {
  candidateId: string;
  jdId?: string;
  skill: string;
  evidence: string;
}

@Injectable()
export class SkillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(candidateId?: string, jdId?: string): Promise<VerifiedSkillDto[]> {
    const rows = await this.prisma.verifiedSkill.findMany({
      where: {
        ...(candidateId ? { candidateId } : {}),
        ...(jdId ? { jdId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toDto(r));
  }

  async updateStatus(
    id: string,
    status: SkillDecision,
    evidence: string | undefined,
    user: AuthUser,
  ): Promise<VerifiedSkillDto> {
    const row = await this.prisma.verifiedSkill.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Verified skill not found');

    const trimmedEvidence = evidence?.trim();
    if (status === 'VERIFIED' && !trimmedEvidence) {
      throw new BadRequestException(
        'Marking a skill VERIFIED requires non-empty evidence from the genuineness interview',
      );
    }

    const updated = await this.prisma.verifiedSkill.update({
      where: { id },
      data: {
        status,
        ...(trimmedEvidence ? { evidence: trimmedEvidence } : {}),
        ...(status === 'VERIFIED' ? { verifiedById: user.id, verifiedAt: new Date() } : {}),
      },
    });

    await this.audit.log({
      userId: user.id,
      action: DECISION_AUDIT_ACTION[status],
      entityType: 'verified_skill',
      entityId: id,
      detail: {
        skill: row.skill,
        status,
        candidateId: row.candidateId,
        jdId: row.jdId,
      },
    });

    return this.toDto(updated);
  }

  /**
   * Push missing JD skills into the verification workflow as PROPOSED rows.
   * This is the honest path from "the analysis says these skills are absent"
   * to "the CV may include them": the recruiter asks about each skill in the
   * screening interview, marks the ones the candidate actually has VERIFIED
   * (with evidence), and only those enter regenerated CVs.
   */
  async proposeMissing(
    input: { candidateId: string; jdId: string; skills: string[] },
    user: AuthUser,
  ): Promise<{ created: VerifiedSkillDto[]; skippedExisting: string[] }> {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: input.candidateId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    const jd = await this.prisma.jd.findFirst({ where: { id: input.jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');

    const wanted = [...new Set(input.skills.map((s) => s.trim()).filter(Boolean))];
    if (wanted.length === 0) throw new BadRequestException('No skills provided');

    const existing = await this.prisma.verifiedSkill.findMany({
      where: { candidateId: input.candidateId, OR: [{ jdId: input.jdId }, { jdId: null }] },
      select: { skill: true },
    });
    const existingSet = new Set(existing.map((r) => r.skill.toLowerCase()));

    const created: VerifiedSkillDto[] = [];
    const skippedExisting: string[] = [];
    for (const skill of wanted) {
      if (existingSet.has(skill.toLowerCase())) {
        skippedExisting.push(skill);
        continue;
      }
      const row = await this.prisma.verifiedSkill.create({
        data: {
          candidateId: input.candidateId,
          jdId: input.jdId,
          skill,
          tier: 'UNVERIFIED_POSSIBLE',
          status: 'PROPOSED',
          evidence:
            'Listed as missing in the match analysis — ask the candidate whether they have it ' +
            '(many CVs omit real skills). VERIFY with evidence only if genuinely held; never add unverified.',
        },
      });
      created.push(this.toDto(row));
    }

    if (created.length > 0) {
      await this.audit.log({
        userId: user.id,
        action: 'SKILL_PROPOSED',
        entityType: 'verified_skill',
        entityId: input.candidateId,
        detail: {
          candidateId: input.candidateId,
          jdId: input.jdId,
          skills: created.map((c) => c.skill),
          source: 'missing_from_analysis',
        },
      });
    }

    return { created, skippedExisting };
  }

  /** Recruiter directly records a skill verified in the genuineness interview. */
  async create(input: CreateVerifiedSkillInput, user: AuthUser): Promise<VerifiedSkillDto> {
    const evidence = input.evidence.trim();
    if (!evidence) {
      throw new BadRequestException('Recording a verified skill requires non-empty evidence');
    }

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: input.candidateId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    if (input.jdId) {
      const jd = await this.prisma.jd.findFirst({ where: { id: input.jdId, deletedAt: null } });
      if (!jd) throw new NotFoundException('JD not found');
    }

    const row = await this.prisma.verifiedSkill.create({
      data: {
        candidateId: input.candidateId,
        jdId: input.jdId ?? null,
        skill: input.skill.trim(),
        tier: 'UNVERIFIED_POSSIBLE',
        status: 'VERIFIED',
        evidence,
        verifiedById: user.id,
        verifiedAt: new Date(),
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'SKILL_VERIFIED',
      entityType: 'verified_skill',
      entityId: row.id,
      detail: {
        skill: row.skill,
        candidateId: row.candidateId,
        jdId: row.jdId,
        directEntry: true,
      },
    });

    return this.toDto(row);
  }

  private toDto(row: VerifiedSkill): VerifiedSkillDto {
    return {
      id: row.id,
      candidateId: row.candidateId,
      jdId: row.jdId,
      skill: row.skill,
      tier: row.tier,
      status: row.status,
      evidence: row.evidence,
      verifiedById: row.verifiedById,
      verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
