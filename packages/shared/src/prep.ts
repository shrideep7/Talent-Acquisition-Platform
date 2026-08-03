import { z } from 'zod';

/**
 * One question in the HR first-screening-call deck. Written for a
 * non-technical recruiter: every question carries the claim it verifies,
 * what a genuine answer sounds like, and the red flags — so HR can judge
 * the answer without technical depth.
 */
export const HrScreeningQuestionSchema = z.object({
  area: z
    .enum(['experience', 'skills', 'projects', 'education', 'logistics'])
    .describe('Which part of the CV this question verifies'),
  claim: z
    .string()
    .describe('The specific CV claim being checked, e.g. "Data Engineer at TCS, Jan 2019 – Present"'),
  question: z
    .string()
    .describe('The question, worded so a non-technical HR recruiter can ask it naturally on a phone call'),
  genuineAnswer: z
    .string()
    .describe("What a genuine candidate's answer sounds like — cues HR can recognize without technical depth"),
  redFlags: z
    .array(z.string())
    .describe('Answer patterns suggesting the claim is inflated or fabricated'),
  followUp: z
    .string()
    .nullable()
    .describe('One probing follow-up to use when the first answer is vague'),
});
export type HrScreeningQuestion = z.infer<typeof HrScreeningQuestionSchema>;

/**
 * Deck for MFD HR's FIRST telephonic screening call: a genuineness check a
 * non-technical recruiter can run over the candidate's experience, skills
 * and projects before anyone invests in a technical round.
 */
export const HrScreeningCallSchema = z.object({
  callOpening: z
    .array(z.string())
    .describe('2-4 short lines to open the call: introduction, purpose, consent to ask verification questions'),
  questions: z
    .array(HrScreeningQuestionSchema)
    .describe('10-16 questions in the order the call should flow, most load-bearing claims first'),
  logisticsChecklist: z
    .array(z.string())
    .describe('Standard items to confirm before closing: notice period, current/expected CTC, work location and relocation, offers in hand, reason for change'),
  verdictGuidance: z
    .array(z.string())
    .describe('How HR should judge the call afterwards: which answer patterns mean proceed, probe deeper in the genuineness interview, or reject'),
});
export type HrScreeningCall = z.infer<typeof HrScreeningCallSchema>;

/**
 * Interview preparation pack: likely client-interview questions, skill gaps
 * for candidate briefing, genuineness screening questions for MFD's
 * internal interview, and the HR first-screening-call deck.
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
  hrScreeningCall: HrScreeningCallSchema.describe(
    "Deck for MFD HR's first telephonic screening call — genuineness checks a non-technical recruiter can run on the candidate's experience, skills and projects",
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
