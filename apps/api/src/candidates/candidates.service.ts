import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Candidate, CvDocument, Prisma } from '@prisma/client';
import { ParsedCvSchema } from '@mfd/shared';
import type {
  CandidateDto,
  CandidateFacetsDto,
  CandidateSource,
  ConsentStatus,
  CvDocumentDto,
  FacetCount,
  ParsedCv,
  PipelineStage,
} from '@mfd/shared';
import { LlmService } from '../ai/llm.service';
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

/** Case-insensitive value counter that displays each value's most frequent spelling. */
class FacetCounter {
  private readonly counts = new Map<string, { count: number; variants: Map<string, number> }>();

  add(value: string): void {
    const key = value.toLowerCase();
    const entry = this.counts.get(key) ?? { count: 0, variants: new Map<string, number>() };
    entry.count += 1;
    entry.variants.set(value, (entry.variants.get(value) ?? 0) + 1);
    this.counts.set(key, entry);
  }

  toSorted(limit: number): FacetCount[] {
    return [...this.counts.values()]
      .map((entry) => {
        let display = '';
        let best = 0;
        for (const [variant, n] of entry.variants) {
          if (n > best) {
            best = n;
            display = variant;
          }
        }
        return { value: display, count: entry.count };
      })
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
      .slice(0, limit);
  }
}

/** Segmentation filters for the candidate list. All optional; combined with AND. */
export interface CandidateListFilters {
  /** Substring match on full name or current title. */
  search?: string;
  /** Skill names (exact, case-insensitive — the UI picks them from facets). */
  skills?: string[];
  /** 'any' = at least one selected skill; 'all' = every selected skill. */
  skillMode?: 'any' | 'all';
  locations?: string[];
  sources?: CandidateSource[];
  consentStatuses?: ConsentStatus[];
  /** Candidate occupies at least one of these pipeline stages (any JD). */
  stages?: PipelineStage[];
  minExperience?: number;
  maxExperience?: number;
}

@Injectable()
export class CandidatesService {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly llm: LlmService,
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

    const ai = await this.llm.structured({
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
    await this.llm.tagCacheWithCandidate(ai.cacheKey, candidate.id);

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

  async list(filters: CandidateListFilters = {}): Promise<CandidateDto[]> {
    // Everything that lives on the candidate row filters in SQL; skills and
    // pipeline stages come from related JSON/rows and filter in memory below.
    const and: Prisma.CandidateWhereInput[] = [{ deletedAt: null }];

    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { currentTitle: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.sources?.length) and.push({ source: { in: filters.sources } });
    if (filters.consentStatuses?.length) {
      and.push({ consentStatus: { in: filters.consentStatuses } });
    }
    if (filters.locations?.length) {
      and.push({
        OR: filters.locations.map((loc) => ({
          currentLocation: { equals: loc, mode: 'insensitive' as const },
        })),
      });
    }
    if (filters.minExperience !== undefined || filters.maxExperience !== undefined) {
      and.push({
        totalYearsExperience: {
          ...(filters.minExperience !== undefined ? { gte: filters.minExperience } : {}),
          ...(filters.maxExperience !== undefined ? { lte: filters.maxExperience } : {}),
        },
      });
    }

    const candidates = await this.prisma.candidate.findMany({
      where: { AND: and },
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
            parsedCv: true,
          },
        },
        pipelineEntries: { select: { stage: true } },
      },
    });

    const wantedSkills = (filters.skills ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean);
    const wantedStages = new Set(filters.stages ?? []);

    const result: CandidateDto[] = [];
    for (const c of candidates) {
      const latestParsed = c.cvDocuments.find((d) => d.parsedCv !== null)?.parsedCv;
      const skills = latestParsed
        ? this.extractSkills(latestParsed as unknown as ParsedCv)
        : [];
      const stages = [...new Set(c.pipelineEntries.map((e) => e.stage))] as PipelineStage[];

      if (wantedSkills.length > 0) {
        const have = new Set(skills.map((s) => s.toLowerCase()));
        const match =
          filters.skillMode === 'all'
            ? wantedSkills.every((s) => have.has(s))
            : wantedSkills.some((s) => have.has(s));
        if (!match) continue;
      }
      if (wantedStages.size > 0 && !stages.some((s) => wantedStages.has(s))) continue;

      result.push(
        this.toDto(c, c.cvDocuments.map((d) => this.toCvDocumentSummaryDto(d)), {
          skills,
          pipelineStages: stages,
        }),
      );
    }
    return result;
  }

  /**
   * Filter options with counts over the whole (non-deleted) pool. Values are
   * grouped case-insensitively; the most frequent spelling is displayed.
   */
  async facets(): Promise<CandidateFacetsDto> {
    const candidates = await this.prisma.candidate.findMany({
      where: { deletedAt: null },
      select: {
        currentLocation: true,
        source: true,
        consentStatus: true,
        totalYearsExperience: true,
        cvDocuments: {
          orderBy: { createdAt: 'desc' },
          select: { parsedCv: true },
        },
        pipelineEntries: { select: { stage: true } },
      },
    });

    const skills = new FacetCounter();
    const locations = new FacetCounter();
    const sources = new FacetCounter();
    const consentStatuses = new FacetCounter();
    const stages = new FacetCounter();
    let minExp: number | null = null;
    let maxExp: number | null = null;

    for (const c of candidates) {
      const latestParsed = c.cvDocuments.find((d) => d.parsedCv !== null)?.parsedCv;
      if (latestParsed) {
        for (const skill of this.extractSkills(latestParsed as unknown as ParsedCv)) {
          skills.add(skill);
        }
      }
      if (c.currentLocation) locations.add(c.currentLocation);
      sources.add(c.source);
      consentStatuses.add(c.consentStatus);
      for (const stage of new Set(c.pipelineEntries.map((e) => e.stage))) stages.add(stage);
      if (c.totalYearsExperience !== null) {
        minExp = minExp === null ? c.totalYearsExperience : Math.min(minExp, c.totalYearsExperience);
        maxExp = maxExp === null ? c.totalYearsExperience : Math.max(maxExp, c.totalYearsExperience);
      }
    }

    return {
      total: candidates.length,
      skills: skills.toSorted(200),
      locations: locations.toSorted(100),
      sources: sources.toSorted(10),
      consentStatuses: consentStatuses.toSorted(10),
      stages: stages.toSorted(10),
      experience: { min: minExp, max: maxExp },
    };
  }

  /**
   * Distinct skills evidenced by a parsed CV: the skills section plus the
   * technologies listed on roles and projects. Case-insensitive dedupe,
   * first-seen spelling wins.
   */
  private extractSkills(parsedCv: ParsedCv): string[] {
    const seen = new Map<string, string>();
    const add = (raw: string | null | undefined) => {
      const value = (raw ?? '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!seen.has(key)) seen.set(key, value);
    };
    for (const s of parsedCv.skills) add(s.name);
    for (const r of parsedCv.roles) for (const t of r.technologies) add(t);
    for (const p of parsedCv.projects) for (const t of p.technologies) add(t);
    return [...seen.values()];
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

  toDto(
    candidate: Candidate,
    cvDocuments?: CvDocumentDto[],
    extras?: { skills?: string[]; pipelineStages?: PipelineStage[] },
  ): CandidateDto {
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
      ...(extras?.skills ? { skills: extras.skills } : {}),
      ...(extras?.pipelineStages ? { pipelineStages: extras.pipelineStages } : {}),
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
