import { z } from 'zod';

// ---------------------------------------------------------------------------
// Semantic match — LLM output (strict schema). Rule-based checks are computed
// separately in the scoring engine; this covers only what needs judgment.
// ---------------------------------------------------------------------------

export const SkillJudgementSchema = z.object({
  jdSkill: z.string().describe('The JD skill being assessed (JD wording)'),
  importance: z.enum(['must_have', 'nice_to_have']),
  tier: z
    .enum(['EXPLICIT', 'TERMINOLOGY', 'INFERRED', 'UNVERIFIED_POSSIBLE', 'ABSENT'])
    .describe(
      'EXPLICIT: named in CV. TERMINOLOGY: present under different wording. INFERRED: strongly implied by concrete CV evidence. UNVERIFIED_POSSIBLE: plausible for the profile but not evidenced. ABSENT: no basis at all.',
    ),
  cvTerm: z
    .string()
    .nullable()
    .describe('The wording the CV uses for this skill (for EXPLICIT/TERMINOLOGY), else null'),
  evidence: z
    .string()
    .nullable()
    .describe('Quote or precise reference from the CV that supports the tier; null only for ABSENT/UNVERIFIED_POSSIBLE'),
  rationale: z.string().describe('One-sentence explanation of the judgement'),
});
export type SkillJudgement = z.infer<typeof SkillJudgementSchema>;

export const SemanticMatchSchema = z.object({
  skills: z.array(SkillJudgementSchema).describe('One judgement per JD skill'),
  experience: z.object({
    relevantYears: z
      .number()
      .nullable()
      .describe('Years of experience relevant to this JD (not just total years)'),
    domainMatch: z
      .number()
      .describe('0-100: how well the candidate\'s domain background matches the JD domain'),
    roleSimilarity: z
      .number()
      .describe('0-100: how similar the candidate\'s recent roles are to the JD role'),
    rationale: z.string(),
  }),
  education: z.object({
    matchedRequirements: z.array(z.string()).describe('JD education/cert requirements the CV satisfies'),
    missingRequirements: z.array(z.string()).describe('JD education/cert requirements not evidenced'),
    rationale: z.string(),
  }),
  semanticKeywordMatches: z
    .array(
      z.object({
        jdTerm: z.string(),
        cvTerm: z.string(),
      }),
    )
    .describe('JD keywords covered by the CV under different wording (beyond exact matches)'),
  overallImpression: z.string().describe('2-3 sentence summary of fit'),
});
export type SemanticMatch = z.infer<typeof SemanticMatchSchema>;

// ---------------------------------------------------------------------------
// ATS format health — rule-based checks on the original document.
// ---------------------------------------------------------------------------

export const AtsCheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  severity: z.enum(['critical', 'warning', 'info']),
  detail: z.string(),
});
export type AtsCheck = z.infer<typeof AtsCheckSchema>;

export const AtsHealthSchema = z.object({
  score: z.number().min(0).max(100),
  checks: z.array(AtsCheckSchema),
});
export type AtsHealth = z.infer<typeof AtsHealthSchema>;

// ---------------------------------------------------------------------------
// Final combined breakdown — deterministic engine output stored per analysis.
// ---------------------------------------------------------------------------

export const MatchBreakdownSchema = z.object({
  totalScore: z.number().min(0).max(100),
  weights: z.object({
    skills: z.number(),
    experience: z.number(),
    keywords: z.number(),
    education: z.number(),
    atsHealth: z.number(),
  }),
  skills: z.object({
    score: z.number().min(0).max(100),
    matched: z.array(z.string()).describe('EXPLICIT + TERMINOLOGY'),
    partial: z.array(z.string()).describe('INFERRED + UNVERIFIED_POSSIBLE'),
    missing: z.array(z.string()).describe('ABSENT'),
    details: z.array(SkillJudgementSchema),
  }),
  experience: z.object({
    score: z.number().min(0).max(100),
    candidateYears: z.number().nullable(),
    relevantYears: z.number().nullable(),
    requiredMinYears: z.number().nullable(),
    requiredMaxYears: z.number().nullable(),
    domainMatch: z.number(),
    roleSimilarity: z.number(),
    rationale: z.string(),
  }),
  keywords: z.object({
    score: z.number().min(0).max(100),
    coveragePct: z.number(),
    exactMatches: z.array(z.string()),
    semanticMatches: z.array(z.object({ jdTerm: z.string(), cvTerm: z.string() })),
    missing: z.array(z.string()),
  }),
  education: z.object({
    score: z.number().min(0).max(100),
    matchedRequirements: z.array(z.string()),
    missingRequirements: z.array(z.string()),
    rationale: z.string(),
  }),
  atsHealth: AtsHealthSchema,
  overallImpression: z.string(),
});
export type MatchBreakdown = z.infer<typeof MatchBreakdownSchema>;
