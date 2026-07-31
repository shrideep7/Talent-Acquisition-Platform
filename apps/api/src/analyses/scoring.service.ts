import { Injectable, InternalServerErrorException } from '@nestjs/common';
import type { VerifiedSkill } from '@prisma/client';
import { MATCH_ENGINE_VERSION, MatchBreakdownSchema, SemanticMatchSchema } from '@mfd/shared';
import type {
  MatchBreakdown,
  ParsedJd,
  ScoreWeights,
  SemanticMatch,
  SkillJudgement,
} from '@mfd/shared';
import { AnthropicService } from '../ai/anthropic.service';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AtsChecksService } from './ats-checks.service';
import type { IScoringService, ScoreCvInput, ScoreCvResult } from './scoring.types';

type SkillBucket = 'matched' | 'partial' | 'missing';

interface AdjustedJudgement {
  judgement: SkillJudgement;
  credit: number;
  bucket: SkillBucket;
}

/** Deterministic credit per skill tier (before recruiter-verification overrides). */
const TIER_CREDIT: Record<SkillJudgement['tier'], number> = {
  EXPLICIT: 1.0,
  TERMINOLOGY: 1.0,
  INFERRED: 0.6,
  UNVERIFIED_POSSIBLE: 0.25,
  ABSENT: 0,
};

const MUST_HAVE_WEIGHT = 2;
const NICE_TO_HAVE_WEIGHT = 1;
const SEMANTIC_KEYWORD_CREDIT = 0.7;
const NO_MIN_YEARS_BASELINE = 75;
const OVERQUALIFIED_YEARS_FIT = 85;
const OVERQUALIFIED_SLACK_YEARS = 4;

/**
 * The deterministic match-scoring engine. One semantic LLM judgement
 * (content-hash cached) feeds fixed arithmetic: identical inputs always
 * produce the identical MatchBreakdown.
 */
@Injectable()
export class ScoringService implements IScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly anthropic: AnthropicService,
    private readonly settings: SettingsService,
    private readonly atsChecks: AtsChecksService,
  ) {}

  async scoreCv(input: ScoreCvInput): Promise<ScoreCvResult> {
    const weights = await this.settings.getWeights();
    const criteria = input.jd.parsedCriteria;

    const semantic = await this.anthropic.structured({
      promptName: 'semantic-match',
      schema: SemanticMatchSchema,
      schemaVersion: 'v1',
      userContent: JSON.stringify({ jd: criteria, cv: input.parsedCv }),
    });

    const verifications = await this.prisma.verifiedSkill.findMany({
      where: {
        candidateId: input.candidateId,
        OR: [{ jdId: input.jd.id }, { jdId: null }],
      },
    });
    const adjusted = this.applyVerifications(semantic.data.skills, verifications);

    const skills = this.scoreSkills(adjusted);
    const experience = this.scoreExperience(
      semantic.data,
      criteria,
      input.parsedCv.totalYearsExperience,
    );
    const keywords = this.scoreKeywords(criteria, input.cvText, semantic.data);
    const education = this.scoreEducation(criteria, semantic.data);
    const atsHealth = this.atsChecks.check(input.formatSignals, input.cvText);

    const totalScore = this.weightedTotal(
      {
        skills: skills.score,
        experience: experience.score,
        keywords: keywords.score,
        education: education.score,
        atsHealth: atsHealth.score,
      },
      weights,
    );

    let breakdown: MatchBreakdown;
    try {
      breakdown = MatchBreakdownSchema.parse({
        totalScore,
        weights: { ...weights },
        skills,
        experience,
        keywords,
        education,
        atsHealth,
        overallImpression: semantic.data.overallImpression,
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Scoring engine produced an invalid breakdown: ${(err as Error).message}`,
      );
    }

    if (input.persist === false) {
      return { analysisId: null, totalScore, breakdown };
    }

    const analysis = await this.prisma.matchAnalysis.create({
      data: {
        jdId: input.jd.id,
        candidateId: input.candidateId,
        cvDocumentId: input.cvDocumentId ?? null,
        cvVersionId: input.cvVersionId ?? null,
        totalScore,
        breakdown: breakdown as unknown as object,
        engineVersion: MATCH_ENGINE_VERSION,
        promptVersions: { semanticMatch: semantic.promptVersion } as unknown as object,
        createdById: input.userId,
      },
    });

    await this.prisma.pipelineEntry.upsert({
      where: { jdId_candidateId: { jdId: input.jd.id, candidateId: input.candidateId } },
      create: {
        jdId: input.jd.id,
        candidateId: input.candidateId,
        stage: 'SOURCED',
        latestScore: totalScore,
        updatedById: input.userId,
      },
      update: { latestScore: totalScore, updatedById: input.userId },
    });

    await this.proposeVerificationSkills(adjusted, input.candidateId, input.jd.id);

    await this.audit.log({
      userId: input.userId,
      action: 'ANALYSIS_RUN',
      entityType: 'match_analysis',
      entityId: analysis.id,
      detail: {
        jdId: input.jd.id,
        candidateId: input.candidateId,
        cvDocumentId: input.cvDocumentId ?? null,
        cvVersionId: input.cvVersionId ?? null,
        totalScore,
        engineVersion: MATCH_ENGINE_VERSION,
      },
    });

    return { analysisId: analysis.id, totalScore, breakdown };
  }

  // -------------------------------------------------------------------------
  // Recruiter verification overrides
  // -------------------------------------------------------------------------

  private applyVerifications(
    judgements: SkillJudgement[],
    rows: VerifiedSkill[],
  ): AdjustedJudgement[] {
    const bySkill = new Map<string, VerifiedSkill>();
    // Candidate-global rows first so JD-specific rows win on collision.
    for (const row of rows.filter((r) => r.jdId === null)) {
      bySkill.set(row.skill.toLowerCase(), row);
    }
    for (const row of rows.filter((r) => r.jdId !== null)) {
      bySkill.set(row.skill.toLowerCase(), row);
    }

    return judgements.map((judgement): AdjustedJudgement => {
      const row = bySkill.get(judgement.jdSkill.toLowerCase());

      if (row?.status === 'VERIFIED') {
        const evidence = row.evidence
          ? `Recruiter-verified: ${row.evidence}`
          : 'Recruiter-verified in genuineness interview';
        return { judgement: { ...judgement, evidence }, credit: 1, bucket: 'matched' };
      }

      if (
        row?.status === 'REJECTED' &&
        (judgement.tier === 'INFERRED' || judgement.tier === 'UNVERIFIED_POSSIBLE')
      ) {
        return {
          judgement: {
            ...judgement,
            tier: 'ABSENT',
            evidence: null,
            rationale: `${judgement.rationale} (downgraded: recruiter rejected this skill claim)`,
          },
          credit: 0,
          bucket: 'missing',
        };
      }

      const bucket: SkillBucket =
        judgement.tier === 'EXPLICIT' || judgement.tier === 'TERMINOLOGY'
          ? 'matched'
          : judgement.tier === 'ABSENT'
            ? 'missing'
            : 'partial';
      return { judgement, credit: TIER_CREDIT[judgement.tier], bucket };
    });
  }

  // -------------------------------------------------------------------------
  // Component scores
  // -------------------------------------------------------------------------

  private scoreSkills(adjusted: AdjustedJudgement[]): MatchBreakdown['skills'] {
    let weightSum = 0;
    let creditSum = 0;
    const matched: string[] = [];
    const partial: string[] = [];
    const missing: string[] = [];

    for (const entry of adjusted) {
      const weight =
        entry.judgement.importance === 'must_have' ? MUST_HAVE_WEIGHT : NICE_TO_HAVE_WEIGHT;
      weightSum += weight;
      creditSum += weight * entry.credit;
      const bucket =
        entry.bucket === 'matched' ? matched : entry.bucket === 'partial' ? partial : missing;
      bucket.push(entry.judgement.jdSkill);
    }

    const score = weightSum === 0 ? 100 : this.clampPct((100 * creditSum) / weightSum);
    return { score, matched, partial, missing, details: adjusted.map((a) => a.judgement) };
  }

  private scoreExperience(
    semantic: SemanticMatch,
    criteria: ParsedJd,
    candidateYears: number | null,
  ): MatchBreakdown['experience'] {
    const min = criteria.minYearsExperience;
    const max = criteria.maxYearsExperience;
    const relevantYears = semantic.experience.relevantYears;
    // Fall back to total career years when the model returns no relevant-years figure.
    const effectiveYears = relevantYears ?? candidateYears ?? 0;

    let yearsFit: number;
    if (min === null || min <= 0) {
      yearsFit = NO_MIN_YEARS_BASELINE;
    } else if (effectiveYears >= min) {
      yearsFit =
        max !== null && effectiveYears > max + OVERQUALIFIED_SLACK_YEARS
          ? OVERQUALIFIED_YEARS_FIT
          : 100;
    } else {
      yearsFit = Math.max(0, (100 * effectiveYears) / min);
    }

    const domainMatch = this.clampPct(semantic.experience.domainMatch);
    const roleSimilarity = this.clampPct(semantic.experience.roleSimilarity);
    const score = this.clampPct(0.5 * yearsFit + 0.25 * domainMatch + 0.25 * roleSimilarity);

    return {
      score,
      candidateYears,
      relevantYears,
      requiredMinYears: min,
      requiredMaxYears: max,
      domainMatch,
      roleSimilarity,
      rationale: semantic.experience.rationale,
    };
  }

  private scoreKeywords(
    criteria: ParsedJd,
    cvText: string,
    semantic: SemanticMatch,
  ): MatchBreakdown['keywords'] {
    const jdKeywords = criteria.keywords;
    const n = jdKeywords.length;

    const aliasMap = new Map<string, string[]>();
    for (const skill of criteria.requiredSkills) {
      aliasMap.set(skill.name.toLowerCase(), skill.aliases);
    }
    const semanticMap = new Map<string, string>();
    for (const match of semantic.semanticKeywordMatches) {
      const key = match.jdTerm.toLowerCase();
      if (!semanticMap.has(key)) semanticMap.set(key, match.cvTerm);
    }

    const exactMatches: string[] = [];
    const semanticMatches: { jdTerm: string; cvTerm: string }[] = [];
    const missing: string[] = [];
    let weightSum = 0;
    let creditSum = 0;

    jdKeywords.forEach((keyword, index) => {
      // Position-weighted: keyword at rank i of n carries weight (n - i).
      const weight = n - index;
      weightSum += weight;

      const terms = [keyword, ...(aliasMap.get(keyword.toLowerCase()) ?? [])].filter(
        (t) => t.trim().length > 0,
      );
      const exact = terms.some((term) => this.termRegex(term).test(cvText));
      if (exact) {
        creditSum += weight;
        exactMatches.push(keyword);
        return;
      }

      const cvTerm = semanticMap.get(keyword.toLowerCase());
      if (cvTerm !== undefined) {
        creditSum += weight * SEMANTIC_KEYWORD_CREDIT;
        semanticMatches.push({ jdTerm: keyword, cvTerm });
        return;
      }

      missing.push(keyword);
    });

    const score = weightSum === 0 ? 100 : this.clampPct((100 * creditSum) / weightSum);
    const coveragePct =
      n === 0 ? 100 : this.round2((100 * (exactMatches.length + semanticMatches.length)) / n);

    return { score, coveragePct, exactMatches, semanticMatches, missing };
  }

  private scoreEducation(criteria: ParsedJd, semantic: SemanticMatch): MatchBreakdown['education'] {
    const requirementCount = criteria.educationRequirements.length + criteria.certifications.length;
    const matched = semantic.education.matchedRequirements;
    const missing = semantic.education.missingRequirements;

    if (requirementCount === 0) {
      return {
        score: 100,
        matchedRequirements: matched,
        missingRequirements: missing,
        rationale:
          semantic.education.rationale ||
          'The JD states no education or certification requirements',
      };
    }

    const denominator = matched.length + missing.length;
    const score = denominator === 0 ? 100 : this.clampPct((100 * matched.length) / denominator);
    return {
      score,
      matchedRequirements: matched,
      missingRequirements: missing,
      rationale: semantic.education.rationale,
    };
  }

  private weightedTotal(
    scores: Record<keyof ScoreWeights, number>,
    weights: ScoreWeights,
  ): number {
    const keys = Object.keys(weights) as (keyof ScoreWeights)[];
    const weightSum = keys.reduce((acc, key) => acc + weights[key], 0);
    if (weightSum <= 0) return 0;
    const total = keys.reduce((acc, key) => acc + weights[key] * scores[key], 0) / weightSum;
    return Math.max(0, Math.min(100, Math.round(total)));
  }

  // -------------------------------------------------------------------------
  // Persistence helpers
  // -------------------------------------------------------------------------

  /**
   * Feed the recruiter verification queue: every (post-adjustment) INFERRED or
   * UNVERIFIED_POSSIBLE judgement becomes a PROPOSED VerifiedSkill row unless
   * a row for this candidate + JD + skill already exists in any status.
   */
  private async proposeVerificationSkills(
    adjusted: AdjustedJudgement[],
    candidateId: string,
    jdId: string,
  ): Promise<void> {
    for (const entry of adjusted) {
      if (entry.bucket !== 'partial') continue;
      const { tier, jdSkill, rationale } = entry.judgement;
      if (tier !== 'INFERRED' && tier !== 'UNVERIFIED_POSSIBLE') continue;

      const existing = await this.prisma.verifiedSkill.findFirst({
        where: {
          candidateId,
          jdId,
          skill: { equals: jdSkill, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.verifiedSkill.create({
        data: {
          candidateId,
          jdId,
          skill: jdSkill,
          tier,
          status: 'PROPOSED',
          evidence: rationale,
        },
      });
    }
  }

  // -------------------------------------------------------------------------
  // Small utilities
  // -------------------------------------------------------------------------

  /** Case-insensitive whole-term matcher that tolerates non-word chars (C++, CI/CD). */
  private termRegex(term: string): RegExp {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i');
  }

  private clampPct(value: number): number {
    return Math.max(0, Math.min(100, this.round2(value)));
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
