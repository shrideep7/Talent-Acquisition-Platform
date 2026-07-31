import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Candidate, Jd, MatchAnalysis } from '@prisma/client';
import type {
  CandidateDto,
  JdDto,
  MatchAnalysisDto,
  MatchBreakdown,
  ParsedCv,
  ParsedJd,
} from '@mfd/shared';
import { CryptoService } from '../common/crypto.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import type { DocParseMeta } from '../documents/parse-meta';
import { ScoringService } from './scoring.service';

/** List rows are summaries — the full breakdown ships only on single-analysis reads. */
export type MatchAnalysisSummaryDto = Pick<
  MatchAnalysisDto,
  'id' | 'jdId' | 'candidateId' | 'cvDocumentId' | 'cvVersionId' | 'totalScore' | 'createdAt'
>;

@Injectable()
export class AnalysesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly scoring: ScoringService,
  ) {}

  async run(jdId: string, cvDocumentId: string, user: AuthUser): Promise<MatchAnalysisDto> {
    const jd = await this.prisma.jd.findFirst({ where: { id: jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');
    if (!jd.parsedCriteria) {
      throw new UnprocessableEntityException(
        'This JD has no parsed criteria yet — run JD parsing before scoring',
      );
    }

    const doc = await this.prisma.cvDocument.findFirst({
      where: { id: cvDocumentId, candidate: { deletedAt: null } },
    });
    if (!doc) throw new NotFoundException('CV document not found');
    if (!doc.parsedCv) {
      throw new UnprocessableEntityException(
        'This CV document has no parsed content yet — re-parse the CV before scoring',
      );
    }

    const result = await this.scoring.scoreCv({
      jd: {
        id: jd.id,
        rawText: jd.rawText,
        parsedCriteria: jd.parsedCriteria as unknown as ParsedJd,
      },
      parsedCv: doc.parsedCv as unknown as ParsedCv,
      cvText: doc.parsedText,
      formatSignals: doc.parseMeta ? (doc.parseMeta as unknown as DocParseMeta) : null,
      candidateId: doc.candidateId,
      userId: user.id,
      cvDocumentId: doc.id,
      persist: true,
    });
    if (!result.analysisId) {
      throw new InternalServerErrorException('Analysis was not persisted');
    }

    const analysis = await this.prisma.matchAnalysis.findUnique({
      where: { id: result.analysisId },
    });
    if (!analysis) {
      throw new InternalServerErrorException('Analysis row not found after creation');
    }
    return this.toDto(analysis);
  }

  async get(id: string): Promise<MatchAnalysisDto> {
    const analysis = await this.prisma.matchAnalysis.findUnique({
      where: { id },
      include: { jd: true, candidate: true },
    });
    if (!analysis) throw new NotFoundException('Analysis not found');
    return this.toDto(analysis, analysis.jd, analysis.candidate);
  }

  async list(jdId?: string, candidateId?: string): Promise<MatchAnalysisSummaryDto[]> {
    const rows = await this.prisma.matchAnalysis.findMany({
      where: {
        ...(jdId ? { jdId } : {}),
        ...(candidateId ? { candidateId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        jdId: true,
        candidateId: true,
        cvDocumentId: true,
        cvVersionId: true,
        totalScore: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      jdId: row.jdId,
      candidateId: row.candidateId,
      cvDocumentId: row.cvDocumentId,
      cvVersionId: row.cvVersionId,
      totalScore: row.totalScore,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private toDto(analysis: MatchAnalysis, jd?: Jd, candidate?: Candidate): MatchAnalysisDto {
    return {
      id: analysis.id,
      jdId: analysis.jdId,
      cvDocumentId: analysis.cvDocumentId,
      cvVersionId: analysis.cvVersionId,
      candidateId: analysis.candidateId,
      totalScore: analysis.totalScore,
      breakdown: analysis.breakdown as unknown as MatchBreakdown,
      engineVersion: analysis.engineVersion,
      createdById: analysis.createdById,
      createdAt: analysis.createdAt.toISOString(),
      jd: jd ? this.toJdDto(jd) : undefined,
      candidate: candidate ? this.toCandidateDto(candidate) : undefined,
    };
  }

  private toJdDto(jd: Jd): JdDto {
    return {
      id: jd.id,
      title: jd.title,
      clientName: jd.clientName,
      rawText: jd.rawText,
      parsedCriteria: jd.parsedCriteria ? (jd.parsedCriteria as unknown as ParsedJd) : null,
      fileName: jd.fileName,
      createdById: jd.createdById,
      createdAt: jd.createdAt.toISOString(),
      updatedAt: jd.updatedAt.toISOString(),
    };
  }

  private toCandidateDto(candidate: Candidate): CandidateDto {
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
