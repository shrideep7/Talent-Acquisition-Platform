import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Candidate, CvDocument } from '@prisma/client';
import { ParsedCvSchema } from '@mfd/shared';
import type { CandidateDto, CandidateSource, CvDocumentDto, ParsedCv } from '@mfd/shared';
import { AnthropicService } from '../ai/anthropic.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/decorators';
import { CryptoService } from '../common/crypto.service';
import { PrismaService } from '../common/prisma.service';
import { StorageService } from '../common/storage.service';
import { DocumentParserService } from '../documents/document-parser.service';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt'] as const;
const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'application/octet-stream', // some clients send this for any binary upload
];

export interface CreateFromCvBufferOptions {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  userId: string;
  source: CandidateSource;
  consent?: boolean;
  /** Optional recruiter-supplied name that wins over the parsed CV name. */
  fullNameOverride?: string;
}

export interface CreateFromCvBufferResult {
  candidate: Candidate;
  cvDocument: CvDocument;
  parsedCv: ParsedCv;
}

/** Shape used when listing candidates — cvDocuments without heavy fields. */
type CvDocumentSummary = {
  id: string;
  candidateId: string;
  fileName: string;
  mimeType: string;
  ocrUsed: boolean;
  createdAt: Date;
};

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly anthropic: AnthropicService,
    private readonly documentParser: DocumentParserService,
  ) {}

  /**
   * Shared CV-ingestion pipeline: parse the file, store it, run AI CV
   * extraction, dedupe by email hash, and persist candidate + CvDocument.
   * Used by manual upload here and by the bulk-upload/sourcing modules.
   */
  async createFromCvBuffer(opts: CreateFromCvBufferOptions): Promise<CreateFromCvBufferResult> {
    this.assertAllowedFile(opts.fileName, opts.mimeType);

    const parsedDoc = await this.documentParser.parseBuffer(
      opts.buffer,
      opts.fileName,
      opts.mimeType,
    );
    if (!parsedDoc.text.trim()) {
      throw new BadRequestException('No text could be extracted from the CV document');
    }

    const fileKey = await this.storage.put('cvs', opts.fileName, opts.buffer, opts.mimeType);

    const ai = await this.anthropic.structured({
      promptName: 'cv-parse',
      schema: ParsedCvSchema,
      schemaVersion: 'v1',
      userContent: parsedDoc.text,
    });
    const parsedCv = ai.data;

    const fullName = opts.fullNameOverride?.trim() || parsedCv.fullName || 'Unknown';
    const currentTitle = this.mostRecentRoleTitle(parsedCv);
    const emailHash = this.crypto.emailHash(parsedCv.email);

    const consentFields =
      opts.consent === true
        ? { consentStatus: 'GRANTED' as const, consentAt: new Date() }
        : {};

    let candidate: Candidate | null = null;
    let created = false;
    // Dedupe by emailHash with a retry: under concurrent bulk uploads two
    // files for the same person can race findFirst→create; the unique index
    // on emailHash turns the loser into a P2002, which we resolve by
    // re-reading and taking the update path.
    for (let attempt = 0; attempt < 2 && candidate === null; attempt++) {
      const existing = emailHash
        ? await this.prisma.candidate.findFirst({ where: { emailHash, deletedAt: null } })
        : null;

      if (existing) {
        created = false;
        candidate = await this.prisma.candidate.update({
          where: { id: existing.id },
          data: {
            fullName,
            phone: parsedCv.phone ? this.crypto.encrypt(parsedCv.phone) : undefined,
            currentLocation: parsedCv.location ?? undefined,
            currentTitle: currentTitle ?? undefined,
            noticePeriod: parsedCv.noticePeriod ?? undefined,
            totalYearsExperience: parsedCv.totalYearsExperience ?? undefined,
            ...consentFields,
          },
        });
      } else {
        try {
          created = true;
          candidate = await this.prisma.candidate.create({
            data: {
              fullName,
              email: this.crypto.encrypt(parsedCv.email),
              emailHash,
              phone: this.crypto.encrypt(parsedCv.phone),
              currentLocation: parsedCv.location,
              currentTitle,
              noticePeriod: parsedCv.noticePeriod,
              totalYearsExperience: parsedCv.totalYearsExperience,
              source: opts.source,
              createdById: opts.userId,
              ...consentFields,
            },
          });
        } catch (err) {
          if ((err as { code?: string }).code !== 'P2002' || attempt === 1) throw err;
          // Lost the race — loop re-reads and takes the update path.
        }
      }
    }
    if (!candidate) throw new BadRequestException('Could not create or update candidate — retry');

    // Link the cv-parse cache entry (written before the candidate existed)
    // so DPDP erasure can purge it.
    await this.anthropic.tagCacheWithCandidate(ai.cacheKey, candidate.id);

    const cvDocument = await this.prisma.cvDocument.create({
      data: {
        candidateId: candidate.id,
        fileKey,
        fileName: opts.fileName,
        mimeType: opts.mimeType,
        parsedText: parsedDoc.text,
        parsedCv: parsedCv as unknown as object,
        parseMeta: parsedDoc.meta as unknown as object,
        ocrUsed: parsedDoc.meta.ocrUsed,
      },
    });

    await this.audit.log({
      userId: opts.userId,
      action: created ? 'CANDIDATE_CREATED' : 'CANDIDATE_UPDATED',
      entityType: 'candidate',
      entityId: candidate.id,
      detail: { source: opts.source, fileName: opts.fileName, dedupedByEmail: !created },
    });
    await this.audit.log({
      userId: opts.userId,
      action: 'CV_UPLOADED',
      entityType: 'cv_document',
      entityId: cvDocument.id,
      detail: {
        candidateId: candidate.id,
        fileName: opts.fileName,
        ocrUsed: parsedDoc.meta.ocrUsed,
      },
    });
    if (opts.consent === true) {
      await this.audit.log({
        userId: opts.userId,
        action: 'CONSENT_RECORDED',
        entityType: 'candidate',
        entityId: candidate.id,
        detail: { granted: true, via: 'cv_upload' },
      });
    }

    return { candidate, cvDocument, parsedCv };
  }

  async list(search?: string): Promise<CandidateDto[]> {
    const candidates = await this.prisma.candidate.findMany({
      where: {
        deletedAt: null,
        ...(search && search.trim().length > 0
          ? { fullName: { contains: search.trim(), mode: 'insensitive' as const } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        cvDocuments: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            candidateId: true,
            fileName: true,
            mimeType: true,
            ocrUsed: true,
            createdAt: true,
          },
        },
      },
    });
    return candidates.map((c) =>
      this.toDto(c, c.cvDocuments.map((d) => this.toCvDocumentSummaryDto(d))),
    );
  }

  async detail(id: string): Promise<CandidateDto> {
    const candidate = await this.getEntity(id, true);
    const docs = (candidate.cvDocuments ?? []).map((d) => this.toCvDocumentDto(d));
    return this.toDto(candidate, docs);
  }

  async recordConsent(
    id: string,
    granted: boolean,
    note: string | undefined,
    user: AuthUser,
  ): Promise<CandidateDto> {
    await this.getEntity(id, false);

    await this.prisma.candidate.update({
      where: { id },
      data: {
        consentStatus: granted ? 'GRANTED' : 'REVOKED',
        consentAt: new Date(),
        consentNote: note ?? null,
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'CONSENT_RECORDED',
      entityType: 'candidate',
      entityId: id,
      detail: { granted, note: note ?? null },
    });

    return this.detail(id);
  }

  /** DPDP erasure: remove stored CV files (best effort) and hard-delete the row. */
  async erase(id: string, user: AuthUser): Promise<{ success: true }> {
    const candidate = await this.prisma.candidate.findUnique({
      where: { id },
      include: { cvDocuments: { select: { id: true, fileKey: true } } },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const failedFileKeys: string[] = [];
    for (const doc of candidate.cvDocuments) {
      try {
        await this.storage.delete(doc.fileKey);
      } catch (err) {
        failedFileKeys.push(doc.fileKey);
        this.logger.error(
          `Could not delete stored CV file ${doc.fileKey} for candidate ${id}: ${(err as Error).message}`,
        );
      }
    }

    // Purge cached LLM responses that embed this candidate's CV content.
    const purged = await this.prisma.llmCache.deleteMany({ where: { candidateId: id } });

    // Hard delete — cascades wipe cvDocuments, analyses, versions, preps,
    // pipeline entries, and verified skills.
    await this.prisma.candidate.delete({ where: { id } });

    await this.audit.log({
      userId: user.id,
      action: 'CANDIDATE_DELETED',
      entityType: 'candidate',
      entityId: id,
      detail: {
        reason: 'dpdp_erasure',
        llmCachePurged: purged.count,
        // Orphaned object-store keys that need manual cleanup (storage was
        // unreachable during erasure) — the DB rows referencing them are gone.
        ...(failedFileKeys.length > 0 ? { orphanedFileKeys: failedFileKeys } : {}),
      },
    });

    return { success: true };
  }

  async getCvDocumentText(candidateId: string, docId: string): Promise<{ text: string }> {
    const doc = await this.prisma.cvDocument.findFirst({
      where: { id: docId, candidateId, candidate: { deletedAt: null } },
      select: { parsedText: true },
    });
    if (!doc) throw new NotFoundException('CV document not found for this candidate');
    return { text: doc.parsedText };
  }

  toDto(candidate: Candidate, cvDocuments?: CvDocumentDto[]): CandidateDto {
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
      cvDocuments,
    };
  }

  toCvDocumentDto(doc: CvDocument): CvDocumentDto {
    return {
      ...this.toCvDocumentSummaryDto(doc),
      parsedCv: doc.parsedCv ? (doc.parsedCv as unknown as ParsedCv) : null,
    };
  }

  private toCvDocumentSummaryDto(doc: CvDocumentSummary): CvDocumentDto {
    return {
      id: doc.id,
      candidateId: doc.candidateId,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      ocrUsed: doc.ocrUsed,
      createdAt: doc.createdAt.toISOString(),
    };
  }

  private async getEntity(
    id: string,
    withDocuments: boolean,
  ): Promise<Candidate & { cvDocuments?: CvDocument[] }> {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id, deletedAt: null },
      include: withDocuments ? { cvDocuments: { orderBy: { createdAt: 'desc' } } } : undefined,
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  private mostRecentRoleTitle(parsedCv: ParsedCv): string | null {
    const current = parsedCv.roles.find((r) => r.isCurrent);
    if (current) return current.title;
    return parsedCv.roles[0]?.title ?? null;
  }

  private assertAllowedFile(fileName: string, mimeType: string): void {
    const lower = fileName.toLowerCase();
    const extOk = ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!extOk) {
      throw new BadRequestException(
        `Unsupported file type — allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }
    if (!ALLOWED_MIMETYPES.includes(mimeType)) {
      throw new BadRequestException(`Unsupported mimetype: ${mimeType}`);
    }
  }
}
