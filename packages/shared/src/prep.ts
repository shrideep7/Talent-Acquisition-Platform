import { z } from 'zod';

/**
 * Interview preparation pack: likely client-interview questions, skill gaps
 * for candidate briefing, and genuineness screening questions for MFD's
 * internal interview.
 */
export const InterviewPrepSchema = z.object({
  likelyQuestions: z
    .array(
      z.object({
        question: z.string(),
        category: z.enum(['technical', 'project_deep_dive', 'behavioral', 'domain', 'scenario']),
        basis: z.string().describe('Why this question is likely, tied to the JD and/or CV'),
        prepPoints: z
          .array(z.string())
          .describe('What the candidate should prepare/revise to answer this well'),
      }),
    )
    .describe('Questions the client (e.g. NTT DATA) is likely to ask in the technical interview'),
  skillGaps: z
    .array(
      z.object({
        skill: z.string(),
        severity: z.enum(['critical', 'important', 'minor']),
        gapType: z
          .enum(['missing', 'shallow', 'outdated', 'unevidenced'])
          .describe('missing: no exposure. shallow: some exposure, needs depth. outdated: old version/practice. unevidenced: may have it but CV shows nothing.'),
        currentState: z.string().describe('What the CV shows today for this area'),
        prepPlan: z
          .string()
          .describe('Concrete preparation guidance the recruiter can give the candidate before the client interview'),
      }),
    )
    .describe('Gaps between the JD and the candidate, for the pre-interview briefing'),
  screeningQuestions: z
    .array(
      z.object({
        question: z.string(),
        purpose: z.string().describe('What claim on the CV this question verifies'),
        listenFor: z
          .array(z.string())
          .describe('Signals in a genuine answer (specifics, trade-offs, numbers, names of tools)'),
        redFlags: z
          .array(z.string())
          .describe('Signals that the claim may not be genuine (vagueness, textbook-only answers, contradictions)'),
      }),
    )
    .describe(
      'Questions MFD HR should ask in the internal genuineness interview to verify the candidate\'s claimed experience',
    ),
});
export type InterviewPrep = z.infer<typeof InterviewPrepSchema>;

/**
 * Verification checklist generated for Tier-3 (UNVERIFIED_POSSIBLE) skills:
 * asked during the genuineness interview; if the candidate demonstrates the
 * skill the recruiter records evidence and marks it VERIFIED, which allows it
 * into the generated CV with an audit trail.
 */
export const SkillVerificationChecklistSchema = z.object({
  items: z.array(
    z.object({
      skill: z.string(),
      whyPlausible: z.string().describe('Why this skill might exist despite not being on the CV'),
      verificationQuestions: z.array(z.string()),
      evidenceToRecord: z
        .string()
        .describe('What the recruiter should note down if the candidate confirms (project, context, duration)'),
    }),
  ),
});
export type SkillVerificationChecklist = z.infer<typeof SkillVerificationChecklistSchema>;
