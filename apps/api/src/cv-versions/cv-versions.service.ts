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
import { LlmService } from '../ai/llm.service';
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
    private readonly llm: LlmService,
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

    // Only recruiter-VERIFIED skills (evidence recorded in the genuineness
    // interview) may be handed to the generator. ACCEPTED rows influence
    // scoring but never introduce CV lines on their own.
    const verifiedRows = await this.prisma.verifiedSkill.findMany({
      where: {
        candidateId: input.candidateId,
        OR: [{ jdId: input.jdId }, { jdId: null }],
        status: 'VERIFIED',
      },
      orderBy: { createdAt: 'asc' },
    });
    const verifiedSkills = verifiedRows.map((s) => ({ skill: s.skill, evidence: s.evidence ?? '' }));

    const ai = await this.llm.structured({
      promptName: 'cv-rewrite',
      schema: CvRewriteResultSchema,
      schemaVersion: 'v1',
      noCache: true,
      candidateId: input.candidateId,
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
    const allowedSkills = this.buildAllowedSkillSet(
      sourceCv,
      verifiedRows.map((s) => s.skill),
      beforeBreakdown,
    );

    // Skills the model could not trace to the source CV are withheld rather
    // than failing the whole generation; the recruiter sees what was held
    // back and can verify it with the candidate, then regenerate.
    const { cv: generatedCv, removed: withheldSkills } = this.sanitizeGeneratedSkills(
      rewrite.cv,
      allowedSkills,
      cvDocument.parsedText,
    );
    // Employment history, dates, education and certifications remain hard
    // failures — those are factual claims, not phrasing.
    this.assertIntegrity(generatedCv, sourceCv, allowedSkills, cvDocument.parsedText);

    const integrityNotes = [
      ...rewrite.integrityNotes,
      ...withheldSkills.map(
        (skill) =>
          `Withheld "${skill}" from the Skills section — no supporting evidence in the source CV. ` +
          'Confirm it with the candidate in the genuineness interview (Skill Verification on the ' +
          'candidate page), then regenerate to include it.',
      ),
    ];

    const version = await this.createVersionWithRetry({
      candidateId: input.candidateId,
      jdId: input.jdId,
      sourceCvDocumentId: input.cvDocumentId,
      content: generatedCv as unknown as object,
      changeLog: rewrite.changes as unknown as object,
      integrityNotes: integrityNotes as unknown as object,
      targetScore: input.targetScore,
      createdById: user.id,
    });
    const versionNumber = version.versionNumber;

    if (withheldSkills.length > 0) {
      this.logger.log(
        `Withheld ${withheldSkills.length} untraceable skill(s) from version ${version.id}: ${withheldSkills.join(', ')}`,
      );
      await this.proposeWithheldSkills(withheldSkills, input.candidateId, input.jdId);
    }

    const after = await this.scoreGeneratedCv({
      jd: jdInput,
      generated: generatedCv,
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
        ...(withheldSkills.length > 0 ? { withheldSkills } : {}),
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

    // Integrity re-check against the exact document this version was
    // generated from (falling back to the latest parsed CV for legacy rows).
    let sourceDoc = version.sourceCvDocumentId
      ? await this.prisma.cvDocument.findUnique({ where: { id: version.sourceCvDocumentId } })
      : null;
    if (!sourceDoc || !sourceDoc.parsedCv) {
      const docs = await this.prisma.cvDocument.findMany({
        where: { candidateId: version.candidateId },
        orderBy: { createdAt: 'desc' },
      });
      sourceDoc = docs.find((d) => d.parsedCv !== null) ?? null;
    }
    if (!sourceDoc || !sourceDoc.parsedCv) {
      throw new UnprocessableEntityException(
        'No parsed source CV exists for this candidate — cannot verify edit integrity',
      );
    }
    const sourceCv = sourceDoc.parsedCv as unknown as ParsedCv;

    // Skills previously in this version already passed integrity at
    // generation time; recruiter-confirmed rows are also legitimate.
    const confirmedRows = await this.prisma.verifiedSkill.findMany({
      where: {
        candidateId: version.candidateId,
        OR: [{ jdId: version.jdId }, { jdId: null }],
        status: { in: ['VERIFIED', 'ACCEPTED'] },
      },
    });
    const allowedSkills = this.buildAllowedSkillSet(
      sourceCv,
      confirmedRows.map((s) => s.skill),
      null,
    );
    const priorContent = version.content as unknown as GeneratedCv;
    for (const group of priorContent.skills ?? []) {
      for (const item of group.items) allowedSkills.add(item.trim().toLowerCase());
    }

    this.assertIntegrity(content, sourceCv, allowedSkills, sourceDoc.parsedText);

    const after = await this.scoreGeneratedCv({
      jd: { id: jd.id, rawText: jd.rawText, parsedCriteria: parsedJd },
      generated: content,
      sourceCv,
      candidateId: version.candidateId,
      userId: user.id,
      cvVersionId: version.id,
    });

    // Manual edits are recorded in the change log so every version's content
    // trail stays honest — the AI change log alone no longer describes it.
    const priorLog = (version.changeLog as unknown as CvChange[] | null) ?? [];
    const manualEntry: CvChange = {
      section: 'Manual edit',
      changeType: 'rephrase',
      before: null,
      after: 'Recruiter edited the CV content in-app',
      reason: 'Manual recruiter edit after generation',
      evidence: `Edited by ${user.email} — see audit log entry CV_VERSION_EDITED`,
      tier: null,
    };

    const updated = await this.prisma.cvVersion.update({
      where: { id },
      data: {
        content: content as unknown as object,
        changeLog: [...priorLog, manualEntry] as unknown as object,
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
   * Create the version row, retrying on the unique(candidateId,jdId,
   * versionNumber) constraint so concurrent generations never 500.
   */
  private async createVersionWithRetry(data: {
    candidateId: string;
    jdId: string;
    sourceCvDocumentId: string;
    content: object;
    changeLog: object;
    integrityNotes: object;
    targetScore: number;
    createdById: string;
  }): Promise<CvVersion> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const agg = await this.prisma.cvVersion.aggregate({
        where: { candidateId: data.candidateId, jdId: data.jdId },
        _max: { versionNumber: true },
      });
      const versionNumber = (agg._max.versionNumber ?? 0) + 1 + attempt;
      try {
        return await this.prisma.cvVersion.create({
          data: { ...data, versionNumber, status: 'DRAFT' },
        });
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== 'P2002') throw err;
        this.logger.warn(`versionNumber collision for ${data.candidateId}/${data.jdId}, retrying`);
      }
    }
    throw new UnprocessableEntityException('Could not allocate a version number — retry');
  }

  private static norm(s: string | null | undefined): string {
    return (s ?? '').trim().toLowerCase();
  }

  /** Extract {month, year} from date strings like "Jan 2021", "01/2021", "2021". */
  private static monthYear(s: string | null | undefined): { month: number | null; year: number | null } {
    if (!s) return { month: null, year: null };
    const text = s.trim().toLowerCase();
    const yearMatch = /(19|20)\d{2}/.exec(text);
    const year = yearMatch ? parseInt(yearMatch[0], 10) : null;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    let month: number | null = null;
    for (let i = 0; i < months.length; i++) {
      if (text.includes(months[i])) {
        month = i + 1;
        break;
      }
    }
    if (month === null) {
      const numeric = /(?:^|[^\d])(\d{1,2})[\/\-.](19|20)\d{2}/.exec(text);
      if (numeric) {
        const m = parseInt(numeric[1], 10);
        if (m >= 1 && m <= 12) month = m;
      }
    }
    return { month, year };
  }

  private static isPresent(s: string | null | undefined): boolean {
    const t = CvVersionsService.norm(s);
    return t === '' || t === 'present' || t === 'till date' || t === 'current';
  }

  /**
   * A generated date is truthful when it denotes the same month/year as the
   * source date (formats may differ). A date may not be invented where the
   * source has none, dropped where the source has one, or shifted.
   */
  private static datesMatch(sourceDate: string | null, generatedDate: string | null, sourceIsCurrent: boolean): boolean {
    const srcPresent = sourceIsCurrent || CvVersionsService.isPresent(sourceDate);
    const genPresent = CvVersionsService.isPresent(generatedDate);
    if (srcPresent && genPresent) return true;
    if (!sourceDate) return !generatedDate || genPresent === srcPresent;
    if (!generatedDate) return false;
    const src = CvVersionsService.monthYear(sourceDate);
    const gen = CvVersionsService.monthYear(generatedDate);
    if (src.year !== null && gen.year !== null && src.year !== gen.year) return false;
    if (src.month !== null && gen.month !== null && src.month !== gen.month) return false;
    if (src.year !== null && gen.year === null) return false;
    return true;
  }

  /**
   * Words that carry no evidential weight when matching a skill phrase:
   * grammatical filler plus generic capability nouns. "ETL Development" makes
   * one factual claim — ETL — and "development" merely names the activity, so
   * only the specific term must be evidenced in the source CV. This is what
   * lets honest re-labelling through while a claim like "Kubernetes" (whose
   * only token is specific and absent) is still blocked.
   */
  private static readonly SKILL_STOPWORDS = new Set([
    // grammatical filler
    'and', 'or', 'the', 'of', 'for', 'with', 'in', 'on', 'to', 'a', 'an', 'at', 'by',
    'using', 'via', 'other', 'various', 'etc', 'end', 'based', 'across', 'from',
    // generic capability nouns (the activity, not the claim)
    'development', 'design', 'management', 'engineering', 'administration',
    'implementation', 'support', 'analysis', 'optimization', 'migration',
    'integration', 'testing', 'automation', 'modeling', 'modelling',
    'architecture', 'maintenance', 'troubleshooting', 'documentation',
    'reporting', 'monitoring', 'governance', 'tuning', 'processing',
    'handling', 'validation', 'routing', 'orchestration', 'provisioning',
    'configuration', 'deployment', 'build', 'builds', 'delivery', 'practices',
    'skills', 'tools', 'technologies', 'systems', 'solutions', 'expertise',
  ].map((w) => CvVersionsService.stem(w)));

  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter((t) => t.length > 0);
  }

  /**
   * Light suffix stripping so different word forms of the same concept meet:
   * "designed"/"design", "optimization"/"optimized" → "optimiz".
   */
  private static stem(token: string): string {
    let stemmed = token;
    for (const suffix of ['ations', 'ation', 'ings', 'ing', 'ments', 'ment', 'ers', 'er', 'ed', 'es', 's']) {
      if (stemmed.length > suffix.length + 2 && stemmed.endsWith(suffix)) {
        stemmed = stemmed.slice(0, -suffix.length);
        break;
      }
    }
    // Collapse the y/ies split so "query" meets "queries" (→ "queri").
    return stemmed.endsWith('y') ? `${stemmed.slice(0, -1)}i` : stemmed;
  }

  /** Stemmed vocabulary of everything the candidate demonstrably wrote/knows. */
  private static buildTokenIndex(sourceText: string, allowed: Set<string>): Set<string> {
    const index = new Set<string>();
    for (const token of CvVersionsService.tokenize(sourceText)) {
      index.add(CvVersionsService.stem(token));
    }
    for (const skill of allowed) {
      for (const token of CvVersionsService.tokenize(skill)) {
        index.add(CvVersionsService.stem(token));
      }
    }
    return index;
  }

  /**
   * A skill phrase is traceable when every meaningful word in it is evidenced
   * somewhere in the source CV (or in a recruiter-confirmed / evidence-tiered
   * skill). This admits honest rephrasings — "query optimization" from
   * "optimized queries" — while still blocking additions of technologies the
   * candidate never mentioned: "Kubernetes" has no supporting token, so it
   * cannot slip in.
   *
   * Short tokens (<= 3 chars, e.g. "sql", "aws", "etl") must match exactly;
   * longer ones match on a stem prefix.
   */
  private static isSkillTraceable(item: string, allowed: Set<string>, index: Set<string>): boolean {
    const normalized = CvVersionsService.norm(item);
    if (!normalized) return true;
    if (allowed.has(normalized)) return true;

    const covered = (phrase: string): boolean => {
      const tokens = CvVersionsService.tokenize(phrase)
        .map((t) => CvVersionsService.stem(t))
        .filter((t) => !CvVersionsService.SKILL_STOPWORDS.has(t));
      if (tokens.length === 0) return true; // pure category label, claims nothing
      return tokens.every((token) => {
        if (index.has(token)) return true;
        if (token.length <= 3) return false; // acronyms must match exactly
        for (const known of index) {
          if (known.length >= 4 && (known.startsWith(token) || token.startsWith(known))) return true;
        }
        return false;
      });
    };

    // "metadata management (STTM & Audit Lineage)": the base names the
    // capability, the parenthetical names the source artefacts that evidence
    // it. Either one anchoring to the CV makes the claim traceable.
    const parenMatch = /\(([^)]*)\)/.exec(normalized);
    const base = normalized.split('(')[0].trim() || normalized;
    if (covered(base)) return true;
    return parenMatch ? covered(parenMatch[1]) : false;
  }

  /** Skill entries in the generated CV with no traceable origin. */
  private findUntraceableSkills(
    generated: GeneratedCv,
    allowedSkills: Set<string>,
    sourceText: string,
  ): string[] {
    const index = CvVersionsService.buildTokenIndex(sourceText, allowedSkills);
    const offenders: string[] = [];
    for (const group of generated.skills) {
      for (const item of group.items) {
        if (!CvVersionsService.isSkillTraceable(item, allowedSkills, index)) {
          offenders.push(item);
        }
      }
    }
    return offenders;
  }

  /**
   * Remove untraceable skills from a generated CV rather than discarding the
   * whole generation. The CV stays truthful, the recruiter is told exactly
   * what was withheld, and each withheld skill becomes a verification item
   * they can confirm with the candidate and then regenerate.
   */
  private sanitizeGeneratedSkills(
    generated: GeneratedCv,
    allowedSkills: Set<string>,
    sourceText: string,
  ): { cv: GeneratedCv; removed: string[] } {
    const index = CvVersionsService.buildTokenIndex(sourceText, allowedSkills);
    const removed: string[] = [];

    const groups = generated.skills
      .map((group) => {
        const items = group.items.filter((item) => {
          const keep = CvVersionsService.isSkillTraceable(item, allowedSkills, index);
          if (!keep) removed.push(item);
          return keep;
        });
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);

    return { cv: { ...generated, skills: groups }, removed };
  }

  /**
   * Record withheld skills as PROPOSED verification items so they surface in
   * the candidate's Skill Verification card — the recruiter can confirm them
   * in the genuineness interview (with evidence) and regenerate.
   */
  private async proposeWithheldSkills(
    skills: string[],
    candidateId: string,
    jdId: string,
  ): Promise<void> {
    for (const skill of skills) {
      const existing = await this.prisma.verifiedSkill.findFirst({
        where: { candidateId, jdId, skill: { equals: skill, mode: 'insensitive' } },
      });
      if (existing) continue;
      await this.prisma.verifiedSkill
        .create({
          data: {
            candidateId,
            jdId,
            skill,
            tier: 'UNVERIFIED_POSSIBLE',
            status: 'PROPOSED',
            evidence:
              'Proposed by the CV generator as JD-relevant but not evidenced in the source CV — verify with the candidate before including it.',
          },
        })
        .catch((err) => this.logger.warn(`Could not propose skill "${skill}": ${err.message}`));
    }
  }

  /**
   * Every skill the generator may state, from legitimate origins only:
   * the source CV itself, recruiter-confirmed rows, and (for generation)
   * skills the analysis judged EXPLICIT/TERMINOLOGY/INFERRED with evidence.
   */
  private buildAllowedSkillSet(
    source: ParsedCv,
    confirmedSkills: string[],
    breakdown: MatchBreakdown | null,
  ): Set<string> {
    const allowed = new Set<string>();
    const add = (s: string | null | undefined) => {
      const n = CvVersionsService.norm(s);
      if (n) allowed.add(n);
    };
    for (const s of source.skills) add(s.name);
    for (const r of source.roles) for (const t of r.technologies) add(t);
    for (const p of source.projects) for (const t of p.technologies) add(t);
    for (const s of confirmedSkills) add(s);
    if (breakdown) {
      for (const d of breakdown.skills.details) {
        if (d.tier === 'EXPLICIT' || d.tier === 'TERMINOLOGY' || d.tier === 'INFERRED') {
          add(d.jdSkill);
          add(d.cvTerm);
        }
      }
    }
    return allowed;
  }

  /**
   * Employment history, dates, education, and certifications may never be
   * invented or altered by the generator or by manual edits — and no skill
   * may appear without a traceable origin (source CV, evidence-tiered
   * analysis judgement, or recruiter verification).
   */
  private assertIntegrity(
    generated: GeneratedCv,
    source: ParsedCv,
    allowedSkills: Set<string>,
    sourceText: string,
  ): void {
    const norm = CvVersionsService.norm;

    // Roles: employer+title must exist; dates must denote the same period.
    for (const entry of generated.experience) {
      const matches = source.roles.filter(
        (r) => norm(r.employer) === norm(entry.employer) && norm(r.title) === norm(entry.title),
      );
      if (matches.length === 0) {
        this.logger.warn(
          `Integrity check failed: role "${entry.title}" at "${entry.employer}" not in source CV`,
        );
        throw new UnprocessableEntityException(
          'Generated CV altered employment history — regenerate',
        );
      }
      const dateOk = matches.some(
        (r) =>
          CvVersionsService.datesMatch(r.startDate, entry.startDate, false) &&
          CvVersionsService.datesMatch(r.endDate, entry.endDate, r.isCurrent),
      );
      if (!dateOk) {
        this.logger.warn(
          `Integrity check failed: dates for "${entry.title}" at "${entry.employer}" differ from source`,
        );
        throw new UnprocessableEntityException(
          'Generated CV altered employment dates — regenerate',
        );
      }
    }

    // Education: degree must exist; institution/year may not be invented or changed.
    for (const edu of generated.education) {
      const matches = source.education.filter((e) => norm(e.degree) === norm(edu.degree));
      if (matches.length === 0) {
        this.logger.warn(`Integrity check failed: education "${edu.degree}" not in source CV`);
        throw new UnprocessableEntityException(
          'Generated CV added or altered education entries — regenerate',
        );
      }
      const fieldsOk = matches.some(
        (e) =>
          (edu.institution === null || norm(e.institution) === norm(edu.institution)) &&
          (edu.year === null || norm(e.year) === norm(edu.year)),
      );
      if (!fieldsOk) {
        this.logger.warn(
          `Integrity check failed: education details for "${edu.degree}" differ from source`,
        );
        throw new UnprocessableEntityException(
          'Generated CV altered education details (institution/year) — regenerate',
        );
      }
    }

    // Certifications: name must exist; issuer/year may not be invented or changed.
    for (const cert of generated.certifications) {
      const matches = source.certifications.filter((c) => norm(c.name) === norm(cert.name));
      if (matches.length === 0) {
        this.logger.warn(`Integrity check failed: certification "${cert.name}" not in source CV`);
        throw new UnprocessableEntityException(
          'Generated CV added or altered certifications — regenerate',
        );
      }
      const fieldsOk = matches.some(
        (c) =>
          (cert.issuer === null || norm(c.issuer) === norm(cert.issuer)) &&
          (cert.year === null || norm(c.year) === norm(cert.year)),
      );
      if (!fieldsOk) {
        this.logger.warn(
          `Integrity check failed: certification details for "${cert.name}" differ from source`,
        );
        throw new UnprocessableEntityException(
          'Generated CV altered certification details (issuer/year) — regenerate',
        );
      }
    }

    // Skills: every stated skill needs a traceable origin. On generation the
    // caller sanitizes first (untraceable skills are withheld and reported);
    // on manual edits this rejects, so a recruiter records the evidence via
    // the Skill Verification flow rather than typing an unbacked claim.
    const offenders = this.findUntraceableSkills(generated, allowedSkills, sourceText);
    if (offenders.length > 0) {
      this.logger.warn(`Integrity check failed: untraceable skills [${offenders.join(', ')}]`);
      throw new UnprocessableEntityException(
        `These skills are not evidenced in the source CV: ${offenders.slice(0, 5).join(', ')}. ` +
          'Confirm them with the candidate and record them under Skill Verification on the ' +
          'candidate page, then save again.',
      );
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
