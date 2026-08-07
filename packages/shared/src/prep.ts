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
 * Upskilling plan for skills the candidate genuinely LACKS: an honest,
 * send-to-candidate learning path so learnable gaps close before the
 * interview. It never coaches claiming experience — the CV only ever gains
 * skills through the verification workflow.
 */
export const UpskillingItemSchema = z.object({
  skill: z.string(),
  priority: z
    .enum(['critical', 'important', 'nice_to_have'])
    .describe('How much this gap threatens selection for THIS JD'),
  whyItMatters: z.string().describe('What the JD/role needs it for, in one sentence'),
  learnability: z
    .enum(['days', 'weeks', 'months'])
    .describe("Honest effort estimate to interview-ready basics, given this candidate's background"),
  leverageExisting: z
    .string()
    .nullable()
    .describe('What the candidate already knows that transfers, e.g. "AWS Glue experience maps directly onto Azure Data Factory concepts"'),
  learningPath: z
    .array(z.string())
    .describe('2-4 ordered, concrete steps: official docs/quickstarts, a specific free course, what to build'),
  handsOnExercise: z
    .string()
    .describe('One small practical build task that produces demonstrable experience'),
  interviewQuestions: z
    .array(
      z.object({
        question: z.string().describe('A question an interviewer will likely ask on this skill'),
        guidance: z
          .string()
          .describe('How to answer HONESTLY after doing the learning path — including the "I have been actively learning this, here is what I built" framing. Never coach claiming prior professional experience.'),
      }),
    )
    .describe('2-3 questions to practice'),
});
export type UpskillingItem = z.infer<typeof UpskillingItemSchema>;

export const UpskillingPlanSchema = z.object({
  summary: z
    .string()
    .describe('2-3 sentences for the recruiter: how big the gap really is, what is realistically closeable before an interview, and what is not'),
  items: z
    .array(UpskillingItemSchema)
    .describe('Up to ~10 items, highest priority first; group closely-related skills into one item'),
  candidateMessage: z
    .string()
    .describe('Ready-to-send WhatsApp/email message to the candidate: warm, specific, lists the priority skills and first steps. Frames everything as learning — never as claiming experience.'),
});
export type UpskillingPlan = z.infer<typeof UpskillingPlanSchema>;

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
