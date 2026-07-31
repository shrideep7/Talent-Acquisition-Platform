import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { CvVersion } from '@prisma/client';
import { CvRewriteResultSchema, GeneratedCvSchema } from '@mfd/shared';
import type {
  CvChange,
  CvVersionDto,
  GeneratedCv,
  MatchBreakdown,
  ParsedCv,
  ParsedJd,
} from '@mfd/shared';
import { AnthropicService } from '../ai/anthropic.service';
import { ScoringService } from '../analyses/scoring.service';
import type { ScoreCvResult } from '../analyses/scoring.types';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import type { DocParseMeta } from '../documents/parse-meta';
import { renderGeneratedCvText } from './render-cv-text';

export interface GenerateCvVersionInput {
  jdId: string;
  candidateId: string;
  cvDocumentId: string;
  targetScore: number;
}

export interface GenerateCvVersionResult {
  version: CvVersionDto;
  beforeScore: number;
  afterScore: number;
  beforeBreakdown: MatchBreakdown;
  afterBreakdown: MatchBreakdown;
}

export interface UpdateCvVersionResult {
  version: CvVersionDto;
  breakdown: MatchBreakdown;
}

interface JdScoringInput {
  id: string;
  rawText: string;
  parsedCriteria: ParsedJd;
}

@Injectable()
export class CvVersionsService {
  private readonly logger = new Logger(CvVersionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly scoring: ScoringService,
    private readonly audit: AuditService,
  ) {}

  async generate(input: GenerateCvVersionInput, user: AuthUser): Promise<GenerateCvVersionResult> {
    const jd = await this.prisma.jd.findFirst({
      where: { id: input.jdId, deletedAt: null },
    });
    if (!jd) throw new NotFoundException('JD not found');
    if (!jd.parsedCriteria) {
      throw new UnprocessableEntityException('JD has no parsed criteria — parse the JD first');
    }
    const parsedJd = jd.parsedCriteria as unknown as ParsedJd;
    const jdInput: JdScoringInput = { id: jd.id, rawText: jd.rawText, parsedCriteria: parsedJd };

    const cvDocument = await this.prisma.cvDocument.findFirst({
      where: { id: input.cvDocumentId, candidateId: input.candidateId, candidate: { deletedAt: null } },
    });
    if (!cvDocument) throw new NotFoundException('CV document not found for this candidate');
    if (!cvDocument.parsedCv) {
      throw new UnprocessableEntityException('CV document has no parsed CV content');
    }
    const sourceCv = cvDocument.parsedCv as unknown as ParsedCv;

    // Baseline analysis: reuse the latest, or score the source CV now.
    const existing = await this.prisma.matchAnalysis.findFirst({
      where: { jdId: input.jdId, candidateId: input.candidateId, cvDocumentId: input.cvDocumentId },
      orderBy: { createdAt: 'desc' },
    });
    let beforeScore: number;
    let beforeBreakdown: MatchBreakdown;
    if (existing) {
      beforeScore = existing.totalScore;
      beforeBreakdown = existing.breakdown as unknown as MatchBreakdown;
    } else {
      const baseline = await this.scoring.scoreCv({
        jd: jdInput,
        parsedCv: sourceCv,
        cvText: cvDocument.parsedText,
        formatSignals: (cvDocument.parseMeta as unknown as DocParseMeta | null) ?? null,
        candidateId: input.candidateId,
        userId: user.id,
        cvDocumentId: input.cvDocumentId,
        persist: true,
      });
      beforeScore = baseline.totalScore;
      beforeBreakdown = baseline.breakdown;
    }

    // Recruiter-verified/accepted skills usable by the rewrite (JD-specific + global).
    const verifiedRows = await this.prisma.verifiedSkill.findMany({
      where: {
        candidateId: input.candidateId,
        OR: [{ jdId: input.jdId }, { jdId: null }],
        status: { in: ['VERIFIED', 'ACCEPTED'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    const verifiedSkills = verifiedRows.map((s) => ({ skill: s.skill, evidence: s.evidence ?? '' }));

    const ai = await this.anthropic.structured({
      promptName: 'cv-rewrite',
      schema: CvRewriteResultSchema,
      schemaVersion: 'v1',
      noCache: true,
      userContent: JSON.stringify({
        jd: parsedJd,
        sourceCv,
        currentAnalysis: beforeBreakdown,
        verifiedSkills,
        targetScore: input.targetScore,
      }),
    });
    const rewrite = ai.data;

    // Code-level integrity guardrail — never trust the prompt alone.
    this.assertIntegrity(rewrite.cv, sourceCv);

    const agg = await this.prisma.cvVersion.aggregate({
      where: { candidateId: input.candidateId, jdId: input.jdId },
      _max: { versionNumber: true },
    });
    const versionNumber = (agg._max.versionNumber ?? 0) + 1;

    const version = await this.prisma.cvVersion.create({
      data: {
        candidateId: input.candidateId,
        jdId: input.jdId,
        versionNumber,
        content: rewrite.cv as unknown as object,
        changeLog: rewrite.changes as unknown as object,
        integrityNotes: rewrite.integrityNotes as unknown as object,
        targetScore: input.targetScore,
        status: 'DRAFT',
        createdById: user.id,
      },
    });

    const after = await this.scoreGeneratedCv({
      jd: jdInput,
      generated: rewrite.cv,
      sourceCv,
      candidateId: input.candidateId,
      userId: user.id,
      cvVersionId: version.id,
    });

    const updated = await this.prisma.cvVersion.update({
      where: { id: version.id },
      data: { achievedScore: after.totalScore },
    });

    await this.audit.log({
      userId: user.id,
      action: 'CV_VERSION_GENERATED',
      entityType: 'cv_version',
      entityId: version.id,
      detail: {
        targetScore: input.targetScore,
        achievedScore: after.totalScore,
        versionNumber,
      },
    });

    return {
      version: this.toDto(updated),
      beforeScore,
      afterScore: after.totalScore,
      beforeBreakdown,
      afterBreakdown: after.breakdown,
    };
  }

  async updateContent(id: string, rawContent: unknown, user: AuthUser): Promise<UpdateCvVersionResult> {
    const parsed = GeneratedCvSchema.safeParse(rawContent);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ');
      throw new BadRequestException(`Invalid generated CV content: ${issues}`);
    }
    const content = parsed.data;

    const version = await this.prisma.cvVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('CV version not found');

    const jd = await this.prisma.jd.findFirst({ where: { id: version.jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD for this CV version no longer exists');
    if (!jd.parsedCriteria) {
      throw new UnprocessableEntityException('JD has no parsed criteria — parse the JD first');
    }
    const parsedJd = jd.parsedCriteria as unknown as ParsedJd;

    // Integrity re-check against the candidate's latest parsed source CV
    // (assumption: the latest CvDocument is the version's source lineage).
    const docs = await this.prisma.cvDocument.findMany({
      where: { candidateId: version.candidateId },
      orderBy: { createdAt: 'desc' },
    });
    const sourceDoc = docs.find((d) => d.parsedCv !== null);
    if (!sourceDoc || !sourceDoc.parsedCv) {
      throw new UnprocessableEntityException(
        'No parsed source CV exists for this candidate — cannot verify edit integrity',
      );
    }
    const sourceCv = sourceDoc.parsedCv as unknown as ParsedCv;

    this.assertIntegrity(content, sourceCv);

    const after = await this.scoreGeneratedCv({
      jd: { id: jd.id, rawText: jd.rawText, parsedCriteria: parsedJd },
      generated: content,
      sourceCv,
      candidateId: version.candidateId,
      userId: user.id,
      cvVersionId: version.id,
    });

    const updated = await this.prisma.cvVersion.update({
      where: { id },
      data: {
        content: content as unknown as object,
        achievedScore: after.totalScore,
        status: 'EDITED',
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'CV_VERSION_EDITED',
      entityType: 'cv_version',
      entityId: id,
      detail: { versionNumber: version.versionNumber, achievedScore: after.totalScore },
    });

    return { version: this.toDto(updated), breakdown: after.breakdown };
  }

  async list(candidateId?: string, jdId?: string): Promise<CvVersionDto[]> {
    const versions = await this.prisma.cvVersion.findMany({
      where: {
        ...(candidateId ? { candidateId } : {}),
        ...(jdId ? { jdId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    return versions.map((v) => this.toDto(v));
  }

  async getOne(id: string): Promise<CvVersionDto> {
    const version = await this.prisma.cvVersion.findUnique({ where: { id } });
    if (!version) throw new NotFoundException('CV version not found');
    return this.toDto(version);
  }

  /**
   * Employment history, education, and certifications may never be invented
   * or altered by the generator. Employer+title pairs, degree names, and
   * certification names must all exist in the parsed source CV
   * (case-insensitive, trimmed comparison).
   */
  private assertIntegrity(generated: GeneratedCv, source: ParsedCv): void {
    const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

    const sourceRoles = new Set(source.roles.map((r) => `${norm(r.employer)}|${norm(r.title)}`));
    for (const entry of generated.experience) {
      if (!sourceRoles.has(`${norm(entry.employer)}|${norm(entry.title)}`)) {
        this.logger.warn(
          `Integrity check failed: role "${entry.title}" at "${entry.employer}" not in source CV`,
        );
        throw new UnprocessableEntityException(
          'Generated CV altered employment history — regenerate',
        );
      }
    }

    const sourceDegrees = new Set(source.education.map((e) => norm(e.degree)));
    for (const edu of generated.education) {
      if (!sourceDegrees.has(norm(edu.degree))) {
        this.logger.warn(`Integrity check failed: education "${edu.degree}" not in source CV`);
        throw new UnprocessableEntityException(
          'Generated CV added or altered education entries — regenerate',
        );
      }
    }

    const sourceCerts = new Set(source.certifications.map((c) => norm(c.name)));
    for (const cert of generated.certifications) {
      if (!sourceCerts.has(norm(cert.name))) {
        this.logger.warn(`Integrity check failed: certification "${cert.name}" not in source CV`);
        throw new UnprocessableEntityException(
          'Generated CV added or altered certifications — regenerate',
        );
      }
    }
  }

  private async scoreGeneratedCv(opts: {
    jd: JdScoringInput;
    generated: GeneratedCv;
    sourceCv: ParsedCv;
    candidateId: string;
    userId: string;
    cvVersionId: string;
  }): Promise<ScoreCvResult> {
    return this.scoring.scoreCv({
      jd: opts.jd,
      parsedCv: this.toParsedCvEquivalent(opts.generated, opts.sourceCv),
      cvText: renderGeneratedCvText(opts.generated),
      // Generated versions are structurally ATS-clean by construction.
      formatSignals: null,
      candidateId: opts.candidateId,
      userId: opts.userId,
      cvVersionId: opts.cvVersionId,
      persist: true,
    });
  }

  /** Map a GeneratedCv back into the ParsedCv shape the scoring engine expects. */
  private toParsedCvEquivalent(generated: GeneratedCv, source: ParsedCv): ParsedCv {
    return {
      fullName: generated.fullName,
      email: generated.contact.email,
      phone: generated.contact.phone,
      location: generated.contact.location,
      headline: generated.headline,
      summary: generated.summary,
      totalYearsExperience: source.totalYearsExperience,
      noticePeriod: source.noticePeriod,
      skills: generated.skills.flatMap((group) =>
        group.items.map((name) => ({ name, evidence: 'Generated CV skills section' })),
      ),
      roles: generated.experience.map((e) => ({
        employer: e.employer,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        isCurrent: (e.endDate ?? 'Present').trim().toLowerCase() === 'present',
        location: e.location,
        bullets: e.bullets,
        technologies: [],
      })),
      education: generated.education.map((e) => ({
        degree: e.degree,
        institution: e.institution,
        year: e.year,
      })),
      certifications: generated.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
        year: c.year,
      })),
      projects: generated.projects.map((p) => ({
        name: p.name,
        description: p.description,
        technologies: p.technologies,
      })),
      languages: source.languages,
    };
  }

  toDto(version: CvVersion): CvVersionDto {
    return {
      id: version.id,
      candidateId: version.candidateId,
      jdId: version.jdId,
      parentVersionId: version.parentVersionId,
      versionNumber: version.versionNumber,
      content: version.content as unknown as GeneratedCv,
      changeLog: version.changeLog as unknown as CvChange[],
      integrityNotes: (version.integrityNotes as unknown as string[] | null) ?? [],
      targetScore: version.targetScore,
      achievedScore: version.achievedScore,
      status: version.status,
      createdById: version.createdById,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString(),
    };
  }
}
