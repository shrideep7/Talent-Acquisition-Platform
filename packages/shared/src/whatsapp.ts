import { z } from 'zod';

/**
 * WhatsApp pre-screening: a deterministic question flow the candidate answers
 * on WhatsApp before the human screening call. The bot never generates free
 * text — questions are templated, and the LLM only interprets replies.
 */

export const PRESCREEN_CHANNELS = ['WHATSAPP', 'EMAIL'] as const;
export type PrescreenChannel = (typeof PRESCREEN_CHANNELS)[number];

export const SCREENING_CONVERSATION_STATUSES = [
  'INVITED', // invite sent, waiting for the candidate's first reply
  'IN_PROGRESS', // consent given, walking through the questions
  'COMPLETED', // all questions answered — brief available
  'DECLINED', // candidate not interested in the role
  'OPTED_OUT', // candidate asked to stop — do not re-contact on WhatsApp
  'NEEDS_HUMAN', // flow stopped; a recruiter should take over
  'EXPIRED', // no reply / WhatsApp session window closed
  'CANCELLED', // recruiter cancelled the pre-screen
] as const;
export type ScreeningConversationStatus = (typeof SCREENING_CONVERSATION_STATUSES)[number];

/** One question in the flow, snapshotted with the exact text that was sent. */
export interface ScreeningStep {
  key: string;
  kind: 'yes_no' | 'free_text';
  question: string;
  /** For claim-verification steps: the CV claim being checked. */
  claim?: string | null;
  /** Hint for the reply parser about what to extract (e.g. "notice period in days"). */
  extract?: string | null;
}

export interface ScreeningMessage {
  direction: 'out' | 'in';
  text: string;
  at: string;
}

export interface ScreeningAnswer {
  stepKey: string;
  /** The candidate's raw reply text. */
  raw: string;
  /** Normalized short answer. */
  value: string | null;
  /** Numeric normalization where meaningful: notice days, CTC lakhs, offer count. */
  numberValue: number | null;
  yesNo: boolean | null;
  /** Inconsistency or review note attached by the parser. */
  flag: string | null;
}

/** Structured summary handed to the recruiter before the human screening call. */
export interface PreCallBrief {
  interested: boolean | null;
  noticePeriod: string | null;
  noticePeriodDays: number | null;
  currentCtc: string | null;
  currentCtcLakhs: number | null;
  expectedCtc: string | null;
  expectedCtcLakhs: number | null;
  location: string | null;
  locationWilling: boolean | null;
  offersInHand: string | null;
  reasonForChange: string | null;
  claims: { claim: string; confirmed: boolean | null; note: string | null }[];
  candidateQuestions: string[];
  flags: string[];
  callSlot: string | null;
  completedAt: string;
}

export interface ScreeningConversationDto {
  id: string;
  candidateId: string;
  candidateName?: string;
  jdId: string;
  jdTitle?: string;
  status: ScreeningConversationStatus;
  channel: PrescreenChannel;
  /** Public response-form token (email channel) — form URL is /prescreen/<token>. */
  formToken: string | null;
  /** The exact answer link sent to the candidate (external Google Form or built-in page). */
  formUrl?: string | null;
  currentStepKey: string | null;
  steps: ScreeningStep[];
  answers: ScreeningAnswer[];
  transcript: ScreeningMessage[];
  brief: PreCallBrief | null;
  consentCaptured: boolean;
  lastInboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Strict schema for the reply-interpretation LLM call. The model never writes
 * candidate-facing text — it only classifies and normalizes what came in.
 */
export const WaReplyInterpretationSchema = z.object({
  intent: z
    .enum(['answer', 'question', 'opt_out', 'unclear'])
    .describe(
      'answer: reply addresses the question. question: candidate asked something instead. opt_out: wants to stop/unsubscribe. unclear: neither.',
    ),
  yesNo: z
    .boolean()
    .nullable()
    .describe('For yes/no questions: the answer. Null when not a yes/no question or ambiguous.'),
  value: z
    .string()
    .nullable()
    .describe('Normalized short answer, e.g. "60 days, negotiable to 30", "18 LPA fixed + 2 variable"'),
  numberValue: z
    .number()
    .nullable()
    .describe(
      'Numeric normalization per the extract hint: notice period in DAYS, CTC in LAKHS per annum, offer COUNT. Null if not extractable.',
    ),
  candidateQuestion: z
    .string()
    .nullable()
    .describe('If the candidate asked something, the question in their words'),
  flag: z
    .string()
    .nullable()
    .describe(
      'Review note for the recruiter: contradiction with the stated claim, hedging, condition attached to the answer. Null when clean.',
    ),
});
export type WaReplyInterpretation = z.infer<typeof WaReplyInterpretationSchema>;

/**
 * Parsing a full email reply against the whole question list in one pass
 * (the email channel's equivalent of per-message interpretation).
 */
export const EmailReplyParseSchema = z.object({
  answers: z
    .array(
      z.object({
        stepKey: z.string().describe('Key of the question this fragment answers'),
        value: z.string().nullable().describe('Normalized short answer'),
        numberValue: z
          .number()
          .nullable()
          .describe('Notice period in DAYS / CTC in LAKHS per annum / offer COUNT, per the step'),
        yesNo: z.boolean().nullable().describe('For yes/no questions'),
        flag: z
          .string()
          .nullable()
          .describe('Recruiter-facing note: contradiction, hedge, or condition. Null when clean.'),
      }),
    )
    .describe('One entry per question the reply actually answers — omit unanswered questions'),
  candidateQuestions: z
    .array(z.string())
    .describe('Questions the candidate asked back in their reply'),
});
export type EmailReplyParse = z.infer<typeof EmailReplyParseSchema>;

/** Public shape served to the candidate-facing response form (no auth). */
export interface PrescreenFormDto {
  candidateFirstName: string;
  jdTitle: string;
  clientName: string | null;
  status: ScreeningConversationStatus;
  questions: { key: string; kind: 'yes_no' | 'free_text'; question: string }[];
}
