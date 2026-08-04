import type { ParsedCv, ParsedJd, ScreeningStep } from '@mfd/shared';

/**
 * The pre-screen question flow. Every candidate-facing message here is a
 * deterministic template — the LLM never writes outbound text, it only
 * interprets replies. Keep the flow at 8-9 questions (~5 minutes on
 * WhatsApp); anything deeper belongs in the human screening call.
 */

export interface FlowContext {
  candidateName: string;
  jdTitle: string;
  clientName: string | null;
  jdLocation: string | null;
  workMode: string | null;
  candidateLocation: string | null;
  /** Latest role from the parsed CV, for the claim-verification step. */
  currentRole: { employer: string; title: string; startDate: string | null } | null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function buildInviteText(ctx: FlowContext): string {
  const client = ctx.clientName ? ` (staffing partner of ${ctx.clientName})` : '';
  return (
    `Hi ${firstName(ctx.candidateName)}! This is the recruitment assistant of MFD Talent${client}. ` +
    `We came across your profile for the role of *${ctx.jdTitle}* and would like to ask a few quick questions here on WhatsApp — it takes about 5 minutes, anytime that suits you.\n\n` +
    `Your answers are stored securely by MFD and used only for this hiring process. ` +
    `Reply *YES* to continue, or *STOP* to opt out.`
  );
}

/** Template body parameters for the pre-approved Meta invite template. */
export function inviteTemplateParams(ctx: FlowContext): string[] {
  return [firstName(ctx.candidateName), ctx.jdTitle, ctx.clientName ?? 'our client'];
}

export function buildSteps(ctx: FlowContext): ScreeningStep[] {
  const steps: ScreeningStep[] = [];

  const locationBits = [ctx.jdLocation, ctx.workMode && ctx.workMode !== 'unspecified' ? ctx.workMode : null]
    .filter(Boolean)
    .join(', ');
  steps.push({
    key: 'interest',
    kind: 'yes_no',
    question:
      `Great, thank you! The role: *${ctx.jdTitle}*` +
      (ctx.clientName ? ` with ${ctx.clientName}` : '') +
      (locationBits ? ` — ${locationBits}` : '') +
      `. Are you interested in exploring this opportunity? (YES/NO)`,
  });

  steps.push({
    key: 'notice_period',
    kind: 'free_text',
    question:
      'What is your current notice period? (e.g. "30 days", "2 months, negotiable", "serving notice — last day 15 Sep", "immediate")',
    extract: 'notice period in days',
  });

  steps.push({
    key: 'current_ctc',
    kind: 'free_text',
    question: 'What is your current annual CTC? (e.g. "12 LPA" or "12 fixed + 2 variable")',
    extract: 'current CTC in lakhs per annum',
  });

  steps.push({
    key: 'expected_ctc',
    kind: 'free_text',
    question: 'And your expected CTC?',
    extract: 'expected CTC in lakhs per annum',
  });

  const target = ctx.jdLocation
    ? `This role is based in *${ctx.jdLocation}*${ctx.workMode && ctx.workMode !== 'unspecified' ? ` (${ctx.workMode})` : ''}.`
    : '';
  steps.push({
    key: 'location',
    kind: 'free_text',
    question: ctx.candidateLocation
      ? `Our records show you're currently in ${ctx.candidateLocation}. ${target} Are you comfortable with that? (YES/NO — and correct us if your city changed)`
      : `Which city are you currently based in? ${target ? `${target} Would that work for you?` : ''}`.trim(),
    extract: 'current city, and whether they accept the role location/work mode (yes/no)',
  });

  steps.push({
    key: 'offers_in_hand',
    kind: 'free_text',
    question:
      'Do you currently have any other offers in hand, or interviews in final stages? (e.g. "no", or "1 offer — 18 LPA, joining date Oct 1")',
    extract: 'number of offers in hand',
  });

  steps.push({
    key: 'reason_for_change',
    kind: 'free_text',
    question: "What's your main reason for looking for a change?",
  });

  if (ctx.currentRole) {
    const since = ctx.currentRole.startDate ? ` since ${ctx.currentRole.startDate}` : '';
    steps.push({
      key: 'claim_current_role',
      kind: 'yes_no',
      question: `To confirm our records: you're currently working as *${ctx.currentRole.title}* at *${ctx.currentRole.employer}*${since} — is that correct? (YES/NO — correct us if anything is off)`,
      claim: `${ctx.currentRole.title} at ${ctx.currentRole.employer}${since}`,
      extract: 'whether the employment claim is confirmed; note any correction',
    });
  }

  steps.push({
    key: 'call_slot',
    kind: 'free_text',
    question:
      'Last one! Our recruiter will call you for a short screening chat. When suits you best?\n' +
      CALL_SLOT_OPTIONS.map((slot, i) => `${i + 1}️⃣ ${slot}`).join('\n') +
      '\n…or suggest another time.',
    extract: 'preferred call time as text',
  });

  return steps;
}

export const CALL_SLOT_OPTIONS = ['Today 6–8 pm', 'Tomorrow 10 am–12 pm', 'Tomorrow 6–8 pm'];

/** "2" / "2️⃣" / "option 2" → the option text; anything else passes through. */
export function normalizeCallSlot(value: string | null): string | null {
  if (!value) return value;
  const match = /^\D*([1-3])\D*$/.exec(value.trim());
  if (!match) return value;
  return CALL_SLOT_OPTIONS[parseInt(match[1], 10) - 1] ?? value;
}

export function closingMessage(ctx: FlowContext, callSlot: string | null): string {
  const when = callSlot ? ` around *${callSlot}*` : ' shortly';
  return (
    `That's everything — thank you, ${firstName(ctx.candidateName)}! ✅\n` +
    `Our recruiter will call you${when} for a quick chat about the ${ctx.jdTitle} role. ` +
    `If anything changes, just message here. Have a great day!`
  );
}

export function declinedMessage(ctx: FlowContext): string {
  return (
    `No problem at all, ${firstName(ctx.candidateName)} — thanks for letting us know. ` +
    `We'll keep your profile on file for roles that fit better. All the best!`
  );
}

export function optOutMessage(): string {
  return 'Understood — you will not receive further messages from us on WhatsApp. Thank you for your time.';
}

export function clarifyMessage(question: string): string {
  return `Sorry, I didn't quite catch that. ${question}`;
}

export function questionDeflectMessage(question: string): string {
  return (
    `Good question — I'll pass it to our recruiter, who will cover it on the call. ` +
    `Meanwhile: ${question}`
  );
}
