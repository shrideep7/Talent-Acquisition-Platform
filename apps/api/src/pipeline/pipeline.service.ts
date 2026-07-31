import { Injectable, NotFoundException } from '@nestjs/common';
import type { Candidate, PipelineEntry } from '@prisma/client';
import type { PipelineEntryDto, PipelineStage } from '@mfd/shared';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';

type EntryWithCandidate = PipelineEntry & { candidate: Candidate };

@Injectable()
export class PipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** All pipeline entries for a JD, best score first (entries without a score last). */
  async listForJd(jdId: string): Promise<PipelineEntryDto[]> {
    const jd = await this.prisma.jd.findFirst({ where: { id: jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');

    const entries = await this.prisma.pipelineEntry.findMany({
      where: { jdId },
      include: { candidate: true },
      orderBy: [{ latestScore: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    });
    return entries.map((e) => this.toDto(e));
  }

  async update(
    id: string,
    input: { stage?: PipelineStage; notes?: string },
    user: AuthUser,
  ): Promise<PipelineEntryDto> {
    const existing = await this.prisma.pipelineEntry.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Pipeline entry not found');

    const updated = await this.prisma.pipelineEntry.update({
      where: { id },
      data: {
        stage: input.stage ?? undefined,
        notes: input.notes ?? undefined,
        updatedById: user.id,
      },
      include: { candidate: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'PIPELINE_UPDATED',
      entityType: 'pipeline_entry',
      entityId: id,
      detail: {
        jdId: existing.jdId,
        candidateId: existing.candidateId,
        fromStage: existing.stage,
        toStage: updated.stage,
        notesChanged: input.notes !== undefined,
      },
    });

    return this.toDto(updated);
  }

  /** Idempotent add-to-pipeline: upserts on the unique (jdId, candidateId) pair. */
  async upsert(
    input: { jdId: string; candidateId: string; stage?: PipelineStage },
    user: AuthUser,
  ): Promise<PipelineEntryDto> {
    const jd = await this.prisma.jd.findFirst({ where: { id: input.jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: input.candidateId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const entry = await this.prisma.pipelineEntry.upsert({
      where: { jdId_candidateId: { jdId: input.jdId, candidateId: input.candidateId } },
      create: {
        jdId: input.jdId,
        candidateId: input.candidateId,
        stage: input.stage ?? 'SOURCED',
        updatedById: user.id,
      },
      update: {
        stage: input.stage ?? undefined,
        updatedById: user.id,
      },
      include: { candidate: true },
    });

    await this.audit.log({
      userId: user.id,
      action: 'PIPELINE_UPDATED',
      entityType: 'pipeline_entry',
      entityId: entry.id,
      detail: { jdId: input.jdId, candidateId: input.candidateId, stage: entry.stage, via: 'upsert' },
    });

    return this.toDto(entry);
  }

  private toDto(entry: EntryWithCandidate): PipelineEntryDto {
    return {
      id: entry.id,
      jdId: entry.jdId,
      candidateId: entry.candidateId,
      stage: entry.stage,
      notes: entry.notes,
      latestScore: entry.latestScore,
      candidate: this.toCandidateDto(entry.candidate),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private toCandidateDto(candidate: Candidate) {
    return {
      id: candidate.id,
      fullName: candidate.fullName,
      email: this.crypto.decrypt(candidate.email),
      phone: this.crypto.decrypt(candidate.phone),
      currentLocation: candidate.currentLocation,
      currentTitle: candidate.currentTitle,
      noticePeriod: candidate.noticePeriod,
      totalYearsExperience: candidate.totalYearsExperience,
      source: candidate.source,
      consentStatus: candidate.consentStatus,
      consentAt: candidate.consentAt ? candidate.consentAt.toISOString() : null,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    };
  }
}
