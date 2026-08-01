import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SourcingJob, SourcingJobItem } from '@prisma/client';
import type {
  ParsedJd,
  PipelineStage,
  SourcingJobDto,
  SourcingJobItemDto,
} from '@mfd/shared';
import { ScoringService } from '../analyses/scoring.service';
import { CandidatesService } from '../candidates/candidates.service';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../common/prisma.service';
import type { DocParseMeta } from '../documents/parse-meta';

const MAX_ITEM_ERROR_LENGTH = 500;
const BULK_CONCURRENCY = 2;

export interface BulkUploadFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

export interface StartBulkJobOptions {
  jdId: string;
  files: BulkUploadFile[];
  userId: string;
  /** DPDP consent flag captured at upload time, applied to every candidate. */
  consent?: boolean;
}

/** One row of the ranked candidate list for a JD (latest analysis per candidate). */
export interface RankedCandidateDto {
  candidateId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  noticePeriod: string | null;
  totalYearsExperience: number | null;
  totalScore: number;
  analysisId: string;
  cvDocumentId: string | null;
  pipelineStage: PipelineStage | null;
  pipelineEntryId: string | null;
  notes: string | null;
}

interface JobJd {
  id: string;
  rawText: string;
  parsedCriteria: ParsedJd;
}

interface PendingItem {
  itemId: string;
  file: BulkUploadFile;
}

/**
 * Feature 2 fallback mode: bulk CV upload against a JD. Each file flows
 * through the shared CV-ingestion pipeline (parse → candidate dedupe →
 * AI extraction) and is scored against the JD, producing the ranked list.
 * Phase 3 providers (Naukri Resdex) plug in via SourcingProvider.
 */
@Injectable()
export class SourcingService implements OnModuleInit {
  private readonly logger = new Logger(SourcingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly candidatesService: CandidatesService,
    private readonly scoringService: ScoringService,
  ) {}

  /**
   * Jobs process in-memory buffers, so a server restart orphans any job that
   * was RUNNING — mark them FAILED at boot instead of leaving clients polling
   * a job that will never finish.
   */
  async onModuleInit(): Promise<void> {
    const orphaned = await this.prisma.sourcingJob.updateMany({
      where: { status: { in: ['PENDING', 'RUNNING'] } },
      data: { status: 'FAILED', error: 'Interrupted by server restart — re-upload the files' },
    });
    if (orphaned.count > 0) {
      await this.prisma.sourcingJobItem.updateMany({
        where: { status: { in: ['PENDING', 'PROCESSING'] }, job: { status: 'FAILED' } },
        data: { status: 'FAILED', error: 'Interrupted by server restart' },
      });
      this.logger.warn(`Marked ${orphaned.count} orphaned sourcing job(s) as FAILED at boot`);
    }
  }

  /**
   * Create the SourcingJob + item rows, kick off background processing
   * (deliberately not awaited), and return the job row immediately so the
   * client can start polling GET /sourcing/jobs/:id.
   */
  async startBulkJob(opts: StartBulkJobOptions): Promise<SourcingJobDto> {
    if (opts.files.length === 0) {
      throw new BadRequestException('At least one CV file is required');
    }

    const jd = await this.getParsedJd(opts.jdId);

    // Job + items are created atomically so a mid-creation failure can never
    // leave a RUNNING job with no items for the client to poll forever.
    const { job, pending } = await this.prisma.$transaction(async (tx) => {
      const createdJob = await tx.sourcingJob.create({
        data: {
          jdId: opts.jdId,
          provider: 'bulk_upload',
          status: 'RUNNING',
          totalItems: opts.files.length,
          createdById: opts.userId,
        },
      });
      const createdPending: PendingItem[] = [];
      for (const file of opts.files) {
        const item = await tx.sourcingJobItem.create({
          data: { jobId: createdJob.id, fileName: file.originalname, status: 'PENDING' },
        });
        createdPending.push({ itemId: item.id, file });
      }
      return { job: createdJob, pending: createdPending };
    });

    await this.audit.log({
      userId: opts.userId,
      action: 'SOURCING_JOB_STARTED',
      entityType: 'sourcing_job',
      entityId: job.id,
      detail: { jdId: opts.jdId, provider: 'bulk_upload', totalItems: opts.files.length },
    });

    void this.processJob(job.id, jd, pending, opts.userId, opts.consent).catch(async (err) => {
      this.logger.error(
        `Sourcing job ${job.id} crashed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      await this.prisma.sourcingJob
        .update({
          where: { id: job.id },
          data: { status: 'FAILED', error: this.truncateError(err) },
        })
        .catch(() => undefined);
    });

    return this.getJob(job.id);
  }

  /** Background worker: processes items with small fixed concurrency. */
  private async processJob(
    jobId: string,
    jd: JobJd,
    items: PendingItem[],
    userId: string,
    consent?: boolean,
  ): Promise<void> {
    let cursor = 0;
    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor++;
        if (index >= items.length) return;
        await this.processItem(jobId, jd, items[index], userId, consent);
      }
    };
    const workers = Array.from({ length: Math.min(BULK_CONCURRENCY, items.length) }, () =>
      worker(),
    );
    await Promise.all(workers);

    const job = await this.prisma.sourcingJob.findUnique({ where: { id: jobId } });
    const failedItems = job?.failedItems ?? 0;
    const allFailed = items.length > 0 && failedItems >= items.length;
    const finalStatus = allFailed ? ('FAILED' as const) : ('COMPLETED' as const);

    await this.prisma.sourcingJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        error: allFailed ? 'All items failed to process' : null,
      },
    });

    await this.audit.log({
      userId,
      action: 'SOURCING_JOB_COMPLETED',
      entityType: 'sourcing_job',
      entityId: jobId,
      detail: {
        jdId: jd.id,
        status: finalStatus,
        totalItems: items.length,
        failedItems,
      },
    });
  }

  /** Ingest + score one CV file; never throws (failures land on the item row). */
  private async processItem(
    jobId: string,
    jd: JobJd,
    item: PendingItem,
    userId: string,
    consent?: boolean,
  ): Promise<void> {
    await this.prisma.sourcingJobItem.update({
      where: { id: item.itemId },
      data: { status: 'PROCESSING' },
    });

    try {
      const { candidate, cvDocument, parsedCv } = await this.candidatesService.createFromCvBuffer({
        buffer: item.file.buffer,
        fileName: item.file.originalname,
        mimeType: item.file.mimetype,
        userId,
        source: 'BULK_UPLOAD',
        consent,
      });

      const result = await this.scoringService.scoreCv({
        jd: { id: jd.id, rawText: jd.rawText, parsedCriteria: jd.parsedCriteria },
        parsedCv,
        cvText: cvDocument.parsedText,
        formatSignals: cvDocument.parseMeta
          ? (cvDocument.parseMeta as unknown as DocParseMeta)
          : null,
        candidateId: candidate.id,
        userId,
        cvDocumentId: cvDocument.id,
        persist: true,
      });

      await this.prisma.sourcingJobItem.update({
        where: { id: item.itemId },
        data: {
          status: 'DONE',
          candidateId: candidate.id,
          analysisId: result.analysisId,
          totalScore: result.totalScore,
          error: null,
        },
      });
      await this.prisma.sourcingJob.update({
        where: { id: jobId },
        data: { processedItems: { increment: 1 } },
      });
    } catch (err) {
      this.logger.warn(
        `Sourcing job ${jobId} item ${item.itemId} (${item.file.originalname}) failed: ${
          (err as Error).message
        }`,
      );
      await this.prisma.sourcingJobItem.update({
        where: { id: item.itemId },
        data: { status: 'FAILED', error: this.truncateError(err) },
      });
      await this.prisma.sourcingJob.update({
        where: { id: jobId },
        data: { processedItems: { increment: 1 }, failedItems: { increment: 1 } },
      });
    }
  }

  /** Job + item rows for progress polling. */
  async getJob(id: string): Promise<SourcingJobDto> {
    const job = await this.prisma.sourcingJob.findUnique({
      where: { id },
      include: { items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!job) throw new NotFoundException('Sourcing job not found');
    return this.toJobDto(job, job.items);
  }

  /** Recent jobs for a JD, newest first (no item detail — poll a job by id for that). */
  async listJobs(jdId: string): Promise<SourcingJobDto[]> {
    const jd = await this.prisma.jd.findFirst({ where: { id: jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');

    const jobs = await this.prisma.sourcingJob.findMany({
      where: { jdId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return jobs.map((job) => this.toJobDto(job));
  }

  /**
   * Ranked candidate list for a JD: latest MatchAnalysis per candidate,
   * sorted by totalScore desc, joined with pipeline stage/notes. Powers the
   * ranked list and the one-click "Optimize CV for this JD" flow.
   */
  async rankedForJd(jdId: string): Promise<RankedCandidateDto[]> {
    const jd = await this.prisma.jd.findFirst({ where: { id: jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');

    const analyses = await this.prisma.matchAnalysis.findMany({
      where: { jdId, candidate: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: { candidate: true },
    });

    const pipelineEntries = await this.prisma.pipelineEntry.findMany({ where: { jdId } });
    const pipelineByCandidate = new Map(pipelineEntries.map((e) => [e.candidateId, e]));

    // Rows are newest-first, so the first analysis seen per candidate is the latest.
    const rows: RankedCandidateDto[] = [];
    const seen = new Set<string>();
    for (const analysis of analyses) {
      if (seen.has(analysis.candidateId)) continue;
      seen.add(analysis.candidateId);

      const candidate = analysis.candidate;
      const pipeline = pipelineByCandidate.get(analysis.candidateId);
      rows.push({
        candidateId: candidate.id,
        fullName: candidate.fullName,
        email: this.crypto.decrypt(candidate.email),
        phone: this.crypto.decrypt(candidate.phone),
        location: candidate.currentLocation,
        noticePeriod: candidate.noticePeriod,
        totalYearsExperience: candidate.totalYearsExperience,
        totalScore: analysis.totalScore,
        analysisId: analysis.id,
        cvDocumentId: analysis.cvDocumentId,
        pipelineStage: pipeline ? pipeline.stage : null,
        pipelineEntryId: pipeline ? pipeline.id : null,
        notes: pipeline ? pipeline.notes : null,
      });
    }

    rows.sort((a, b) => b.totalScore - a.totalScore);
    return rows;
  }

  private async getParsedJd(jdId: string): Promise<JobJd> {
    const jd = await this.prisma.jd.findFirst({ where: { id: jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');
    if (!jd.parsedCriteria) {
      throw new UnprocessableEntityException(
        'This JD has no parsed criteria yet — run JD parsing before bulk upload',
      );
    }
    return {
      id: jd.id,
      rawText: jd.rawText,
      parsedCriteria: jd.parsedCriteria as unknown as ParsedJd,
    };
  }

  private toJobDto(job: SourcingJob, items?: SourcingJobItem[]): SourcingJobDto {
    return {
      id: job.id,
      jdId: job.jdId,
      provider: job.provider,
      status: job.status,
      totalItems: job.totalItems,
      processedItems: job.processedItems,
      failedItems: job.failedItems,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      items: items ? items.map((item) => this.toItemDto(item)) : undefined,
    };
  }

  private toItemDto(item: SourcingJobItem): SourcingJobItemDto {
    return {
      id: item.id,
      jobId: item.jobId,
      fileName: item.fileName,
      status: item.status,
      error: item.error,
      candidateId: item.candidateId,
      analysisId: item.analysisId,
      totalScore: item.totalScore,
    };
  }

  private truncateError(err: unknown): string {
    const message =
      err instanceof Error && err.message ? err.message : String(err ?? 'Unknown error');
    return message.slice(0, MAX_ITEM_ERROR_LENGTH);
  }
}
