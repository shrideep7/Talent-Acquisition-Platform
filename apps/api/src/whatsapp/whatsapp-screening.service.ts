import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ScreeningConversation } from '@prisma/client';
import { WaReplyInterpretationSchema } from '@mfd/shared';
import type {
  ParsedCv,
  ParsedJd,
  PreCallBrief,
  ScreeningAnswer,
  ScreeningConversationDto,
  ScreeningMessage,
  ScreeningStep,
  WaReplyInterpretation,
} from '@mfd/shared';
import { LlmService } from '../ai/llm.service';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import {
  buildInviteText,
  buildSteps,
  clarifyMessage,
  closingMessage,
  declinedMessage,
  inviteTemplateParams,
  normalizeCallSlot,
  optOutMessage,
  questionDeflectMessage,
  type FlowContext,
} from './screening-flow';
import { WhatsappTransport } from './whatsapp-transport';

const ACTIVE_STATUSES = ['INVITED', 'IN_PROGRESS'] as const;
const MAX_RETRIES_PER_STEP = 1;

type ConversationWithRefs = ScreeningConversation & {
  candidate?: { fullName: string } | null;
  jd?: { title: string } | null;
};

interface ConversationMeta {
  candidateQuestions?: string[];
  flow?: FlowContext;
  transportError?: string;
}

@Injectable()
export class WhatsappScreeningService {
  private readonly logger = new Logger(WhatsappScreeningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    private readonly transport: WhatsappTransport,
  ) {}

  get mode() {
    return this.transport.mode;
  }

  // -------------------------------------------------------------- lifecycle

  async start(
    input: { candidateId: string; jdId: string; phone?: string },
    user: AuthUser,
  ): Promise<ScreeningConversationDto> {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: input.candidateId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (candidate.consentStatus === 'REVOKED') {
      throw new UnprocessableEntityException(
        'Candidate has revoked consent — do not contact them',
      );
    }

    const jd = await this.prisma.jd.findFirst({ where: { id: input.jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');

    const rawPhone = input.phone?.trim() || this.crypto.decrypt(candidate.phone);
    if (!rawPhone) {
      throw new BadRequestException(
        'Candidate has no phone number on file — provide one to start the pre-screen',
      );
    }
    const phoneE164 = normalizePhone(rawPhone);
    if (!phoneE164) {
      throw new BadRequestException(
        `Could not normalize "${rawPhone}" to an international phone number — provide it as +91XXXXXXXXXX`,
      );
    }

    const existing = await this.prisma.screeningConversation.findFirst({
      where: {
        candidateId: input.candidateId,
        jdId: input.jdId,
        status: { in: [...ACTIVE_STATUSES] },
      },
    });
    if (existing) {
      throw new ConflictException(
        'A pre-screen conversation for this candidate and JD is already running — cancel it first to restart',
      );
    }

    // Freeze the flow context so questions stay stable even if the JD/CV change.
    const parsedJd = jd.parsedCriteria ? (jd.parsedCriteria as unknown as ParsedJd) : null;
    const latestDoc = await this.prisma.cvDocument.findFirst({
      where: { candidateId: candidate.id, parsedCv: { not: Prisma.AnyNull } },
      orderBy: { createdAt: 'desc' },
      select: { parsedCv: true },
    });
    const parsedCv = latestDoc?.parsedCv ? (latestDoc.parsedCv as unknown as ParsedCv) : null;
    const currentRole =
      parsedCv?.roles.find((r) => r.isCurrent) ?? parsedCv?.roles[0] ?? null;

    const ctx: FlowContext = {
      candidateName: candidate.fullName,
      jdTitle: jd.title,
      clientName: jd.clientName || null,
      jdLocation: parsedJd?.location ?? null,
      workMode: parsedJd?.workMode ?? null,
      candidateLocation: candidate.currentLocation,
      currentRole: currentRole
        ? { employer: currentRole.employer, title: currentRole.title, startDate: currentRole.startDate }
        : null,
    };
    const steps = buildSteps(ctx);
    const inviteText = buildInviteText(ctx);

    const conversation = await this.prisma.screeningConversation.create({
      data: {
        candidateId: candidate.id,
        jdId: jd.id,
        phone: this.crypto.encrypt(phoneE164) as string,
        phoneHash: this.crypto.sha256(phoneE164),
        steps: steps as unknown as object,
        meta: { candidateQuestions: [], flow: ctx } as unknown as object,
        createdById: user.id,
      },
    });

    const sent = await this.transport.sendInvite(phoneE164, inviteText, inviteTemplateParams(ctx));
    if (!sent.ok) {
      await this.prisma.screeningConversation.update({
        where: { id: conversation.id },
        data: {
          status: 'NEEDS_HUMAN',
          meta: { candidateQuestions: [], flow: ctx, transportError: sent.error } as unknown as object,
        },
      });
      throw new UnprocessableEntityException(
        `WhatsApp invite could not be sent: ${sent.error ?? 'unknown transport error'}`,
      );
    }
    const updated = await this.appendTranscript(conversation.id, 'out', inviteText);

    await this.audit.log({
      userId: user.id,
      action: 'WA_SCREENING_STARTED',
      entityType: 'screening_conversation',
      entityId: conversation.id,
      detail: { candidateId: candidate.id, jdId: jd.id, mode: this.transport.mode },
    });

    return this.toDto({ ...updated, candidate: { fullName: candidate.fullName }, jd: { title: jd.title } });
  }

  async list(candidateId?: string, jdId?: string): Promise<ScreeningConversationDto[]> {
    const rows = await this.prisma.screeningConversation.findMany({
      where: {
        ...(candidateId ? { candidateId } : {}),
        ...(jdId ? { jdId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { candidate: { select: { fullName: true } }, jd: { select: { title: true } } },
    });
    return rows.map((r) => this.toDto(r));
  }

  async getOne(id: string): Promise<ScreeningConversationDto> {
    const row = await this.prisma.screeningConversation.findUnique({
      where: { id },
      include: { candidate: { select: { fullName: true } }, jd: { select: { title: true } } },
    });
    if (!row) throw new NotFoundException('Pre-screen conversation not found');
    return this.toDto(row);
  }

  async cancel(id: string, user: AuthUser): Promise<ScreeningConversationDto> {
    const row = await this.prisma.screeningConversation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pre-screen conversation not found');
    if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
      throw new UnprocessableEntityException('Conversation is already finished');
    }
    await this.prisma.screeningConversation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.audit.log({
      userId: user.id,
      action: 'WA_SCREENING_CANCELLED',
      entityType: 'screening_conversation',
      entityId: id,
      detail: { candidateId: row.candidateId, jdId: row.jdId },
    });
    return this.getOne(id);
  }

  /** Simulator: feed a "candidate" reply into a conversation (simulated mode only). */
  async simulateReply(id: string, text: string): Promise<ScreeningConversationDto> {
    if (this.transport.mode !== 'simulated') {
      throw new BadRequestException(
        'Simulator replies are only available in simulated mode (WHATSAPP_MODE=simulated)',
      );
    }
    const row = await this.prisma.screeningConversation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pre-screen conversation not found');
    await this.handleInboundForConversation(row, text);
    return this.getOne(id);
  }

  // -------------------------------------------------------------- inbound

  /** Entry point for real WhatsApp webhook messages, routed by phone hash. */
  async handleInboundMessage(waPhone: string, text: string): Promise<void> {
    const phoneE164 = normalizePhone(waPhone);
    if (!phoneE164) return;
    const conversation = await this.prisma.screeningConversation.findFirst({
      where: { phoneHash: this.crypto.sha256(phoneE164), status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!conversation) {
      this.logger.log(`Inbound WhatsApp message from unknown/finished conversation — ignoring`);
      return;
    }
    await this.handleInboundForConversation(conversation, text);
  }

  private async handleInboundForConversation(
    row: ScreeningConversation,
    text: string,
  ): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
      this.logger.log(`Message for conversation ${row.id} in terminal state ${row.status} — ignored`);
      return;
    }

    let conversation = await this.appendTranscript(row.id, 'in', trimmed, true);

    // Universal opt-out keyword, honored at any point in the flow.
    if (/^\s*(stop|unsubscribe|opt\s*out)\s*$/i.test(trimmed)) {
      await this.finishConversation(conversation, 'OPTED_OUT', optOutMessage());
      return;
    }

    if (conversation.status === 'INVITED') {
      await this.handleInviteReply(conversation, trimmed);
      return;
    }
    await this.handleStepReply(conversation, trimmed);
  }

  private async handleInviteReply(row: ScreeningConversation, reply: string): Promise<void> {
    const yesNo = quickYesNo(reply);
    let accepted: boolean;
    if (yesNo !== null) {
      accepted = yesNo;
    } else {
      const parsed = await this.interpret(row, inviteStep(), reply);
      accepted = parsed.intent === 'opt_out' ? false : parsed.yesNo !== false;
    }

    if (!accepted) {
      await this.finishConversation(row, 'OPTED_OUT', optOutMessage());
      return;
    }

    // The invite carries the consent language, so YES = consent to process.
    await this.prisma.candidate.updateMany({
      where: { id: row.candidateId, consentStatus: 'PENDING' },
      data: {
        consentStatus: 'GRANTED',
        consentAt: new Date(),
        consentNote: 'Granted via WhatsApp pre-screen reply',
      },
    });
    await this.audit.log({
      userId: null,
      action: 'CONSENT_RECORDED',
      entityType: 'candidate',
      entityId: row.candidateId,
      detail: { granted: true, via: 'whatsapp_pre_screen', conversationId: row.id },
    });

    const steps = row.steps as unknown as ScreeningStep[];
    const first = steps[0];
    await this.prisma.screeningConversation.update({
      where: { id: row.id },
      data: { status: 'IN_PROGRESS', currentStepKey: first.key, consentCaptured: true },
    });
    await this.sendBotMessage(row, first.question);
  }

  private async handleStepReply(row: ScreeningConversation, reply: string): Promise<void> {
    const steps = row.steps as unknown as ScreeningStep[];
    const stepIndex = steps.findIndex((s) => s.key === row.currentStepKey);
    if (stepIndex === -1) {
      this.logger.error(`Conversation ${row.id} has unknown currentStepKey ${row.currentStepKey}`);
      return;
    }
    const step = steps[stepIndex];

    const parsed = await this.interpretWithFallback(row, step, reply);

    if (parsed.intent === 'opt_out') {
      await this.finishConversation(row, 'OPTED_OUT', optOutMessage());
      return;
    }

    if (parsed.intent === 'question') {
      // Deterministic deflection: log the question for the recruiter, re-ask.
      await this.pushCandidateQuestion(row, parsed.candidateQuestion ?? reply);
      await this.sendBotMessage(row, questionDeflectMessage(step.question));
      return;
    }

    if (parsed.intent === 'unclear' && row.retryCount < MAX_RETRIES_PER_STEP) {
      await this.prisma.screeningConversation.update({
        where: { id: row.id },
        data: { retryCount: row.retryCount + 1 },
      });
      await this.sendBotMessage(row, clarifyMessage(step.question));
      return;
    }

    // Record the answer (an exhausted-retries reply is kept raw and flagged).
    const rawValue = parsed.value ?? (parsed.intent === 'unclear' ? reply : null);
    const answer: ScreeningAnswer = {
      stepKey: step.key,
      raw: reply,
      value: step.key === 'call_slot' ? normalizeCallSlot(rawValue) : rawValue,
      numberValue: parsed.numberValue,
      yesNo: parsed.yesNo,
      flag:
        parsed.flag ??
        (parsed.intent === 'unclear' ? 'Reply could not be interpreted — review the raw text' : null),
    };
    const answers = [...((row.answers as unknown as ScreeningAnswer[]) ?? []), answer];

    // "Not interested" ends the flow politely.
    if (step.key === 'interest' && parsed.yesNo === false) {
      await this.prisma.screeningConversation.update({
        where: { id: row.id },
        data: { answers: answers as unknown as object, retryCount: 0 },
      });
      const fresh = await this.prisma.screeningConversation.findUniqueOrThrow({ where: { id: row.id } });
      await this.finishConversation(fresh, 'DECLINED', declinedMessage(this.flowCtx(row)));
      return;
    }

    const next = steps[stepIndex + 1];
    if (next) {
      await this.prisma.screeningConversation.update({
        where: { id: row.id },
        data: { answers: answers as unknown as object, currentStepKey: next.key, retryCount: 0 },
      });
      await this.sendBotMessage(row, next.question);
      return;
    }

    // Flow complete.
    await this.prisma.screeningConversation.update({
      where: { id: row.id },
      data: { answers: answers as unknown as object, currentStepKey: null, retryCount: 0 },
    });
    const fresh = await this.prisma.screeningConversation.findUniqueOrThrow({ where: { id: row.id } });
    const brief = this.buildBrief(fresh);
    await this.finishConversation(fresh, 'COMPLETED', closingMessage(this.flowCtx(row), brief.callSlot), brief);
    await this.applyBriefToRecords(fresh, brief);
  }

  // -------------------------------------------------------------- parsing

  private async interpretWithFallback(
    row: ScreeningConversation,
    step: ScreeningStep,
    reply: string,
  ): Promise<WaReplyInterpretation> {
    // Fast path: unambiguous yes/no needs no model call.
    if (step.kind === 'yes_no') {
      const quick = quickYesNo(reply);
      if (quick !== null) {
        return { intent: 'answer', yesNo: quick, value: quick ? 'Yes' : 'No', numberValue: null, candidateQuestion: null, flag: null };
      }
    }
    try {
      return await this.interpret(row, step, reply);
    } catch (err) {
      // The conversation must never stall because the AI provider is down —
      // degrade to heuristics and flag the answer for recruiter review.
      this.logger.warn(`Reply interpretation failed, using heuristics: ${(err as Error).message}`);
      return heuristicInterpretation(step, reply);
    }
  }

  private async interpret(
    row: ScreeningConversation,
    step: ScreeningStep,
    reply: string,
  ): Promise<WaReplyInterpretation> {
    const result = await this.llm.structured({
      promptName: 'whatsapp-parse',
      schema: WaReplyInterpretationSchema,
      schemaVersion: 'v1',
      candidateId: row.candidateId,
      userContent: JSON.stringify({
        step: { key: step.key, kind: step.kind, question: step.question, claim: step.claim ?? null, extract: step.extract ?? null },
        reply,
        candidateName: this.flowCtx(row).candidateName,
      }),
      maxTokens: 2000,
    });
    return result.data;
  }

  // -------------------------------------------------------------- brief

  private buildBrief(row: ScreeningConversation): PreCallBrief {
    const answers = (row.answers as unknown as ScreeningAnswer[]) ?? [];
    const meta = (row.meta as unknown as ConversationMeta) ?? {};
    const byKey = new Map(answers.map((a) => [a.stepKey, a]));
    const steps = row.steps as unknown as ScreeningStep[];

    const flags: string[] = [];
    for (const a of answers) {
      if (a.flag) flags.push(`${labelForStep(a.stepKey)}: ${a.flag}`);
    }

    const claims = steps
      .filter((s) => s.claim)
      .map((s) => {
        const a = byKey.get(s.key);
        return {
          claim: s.claim as string,
          confirmed: a?.yesNo ?? null,
          note: a?.flag ?? (a && a.yesNo === null ? a.value : null),
        };
      });

    const interest = byKey.get('interest');
    const notice = byKey.get('notice_period');
    const currentCtc = byKey.get('current_ctc');
    const expectedCtc = byKey.get('expected_ctc');
    const location = byKey.get('location');
    const offers = byKey.get('offers_in_hand');
    const reason = byKey.get('reason_for_change');
    const slot = byKey.get('call_slot');

    return {
      interested: interest?.yesNo ?? null,
      noticePeriod: notice?.value ?? null,
      noticePeriodDays: notice?.numberValue ?? null,
      currentCtc: currentCtc?.value ?? null,
      currentCtcLakhs: currentCtc?.numberValue ?? null,
      expectedCtc: expectedCtc?.value ?? null,
      expectedCtcLakhs: expectedCtc?.numberValue ?? null,
      location: location?.value ?? this.flowCtx(row).candidateLocation,
      locationWilling: location?.yesNo ?? null,
      offersInHand: offers?.value ?? null,
      reasonForChange: reason?.value ?? null,
      claims,
      candidateQuestions: meta.candidateQuestions ?? [],
      flags,
      callSlot: slot?.value ?? null,
      completedAt: new Date().toISOString(),
    };
  }

  /** Push confirmed logistics back onto the candidate record and pipeline. */
  private async applyBriefToRecords(row: ScreeningConversation, brief: PreCallBrief): Promise<void> {
    const data: Prisma.CandidateUpdateInput = {};
    if (brief.noticePeriod) data.noticePeriod = brief.noticePeriod;
    if (brief.location) {
      const candidate = await this.prisma.candidate.findUnique({
        where: { id: row.candidateId },
        select: { currentLocation: true },
      });
      if (candidate && !candidate.currentLocation) data.currentLocation = brief.location;
    }
    if (Object.keys(data).length > 0) {
      await this.prisma.candidate
        .update({ where: { id: row.candidateId }, data })
        .catch((err) => this.logger.warn(`Could not update candidate from brief: ${err.message}`));
    }

    // Interested candidates advance in the pipeline; declines stay a human call.
    if (brief.interested === true) {
      const entry = await this.prisma.pipelineEntry.findUnique({
        where: { jdId_candidateId: { jdId: row.jdId, candidateId: row.candidateId } },
      });
      if (!entry) {
        await this.prisma.pipelineEntry
          .create({
            data: { jdId: row.jdId, candidateId: row.candidateId, stage: 'INTERESTED' },
          })
          .catch((err) => this.logger.warn(`Pipeline create failed: ${err.message}`));
      } else if (entry.stage === 'SOURCED' || entry.stage === 'CONTACTED') {
        await this.prisma.pipelineEntry
          .update({ where: { id: entry.id }, data: { stage: 'INTERESTED' } })
          .catch((err) => this.logger.warn(`Pipeline update failed: ${err.message}`));
      }
    }
  }

  // -------------------------------------------------------------- helpers

  private async finishConversation(
    row: ScreeningConversation,
    status: 'COMPLETED' | 'DECLINED' | 'OPTED_OUT',
    farewell: string,
    brief?: PreCallBrief,
  ): Promise<void> {
    const finalBrief = brief ?? (status !== 'OPTED_OUT' ? this.buildBrief(row) : null);
    await this.prisma.screeningConversation.update({
      where: { id: row.id },
      data: {
        status,
        currentStepKey: null,
        ...(finalBrief ? { brief: finalBrief as unknown as object } : {}),
      },
    });
    await this.sendBotMessage(row, farewell);
    if (status === 'COMPLETED') {
      await this.audit.log({
        userId: null,
        action: 'WA_SCREENING_COMPLETED',
        entityType: 'screening_conversation',
        entityId: row.id,
        detail: { candidateId: row.candidateId, jdId: row.jdId },
      });
    }
  }

  private async sendBotMessage(row: ScreeningConversation, text: string): Promise<void> {
    const phone = this.crypto.decrypt(row.phone);
    if (phone) {
      const sent = await this.transport.sendText(phone, text);
      if (!sent.ok) {
        this.logger.error(`Send failed for conversation ${row.id}: ${sent.error}`);
        await this.prisma.screeningConversation.update({
          where: { id: row.id },
          data: { status: 'NEEDS_HUMAN' },
        });
        return;
      }
    }
    await this.appendTranscript(row.id, 'out', text);
  }

  private async appendTranscript(
    id: string,
    direction: 'in' | 'out',
    text: string,
    isInbound = false,
  ): Promise<ScreeningConversation> {
    const row = await this.prisma.screeningConversation.findUniqueOrThrow({ where: { id } });
    const transcript = [
      ...((row.transcript as unknown as ScreeningMessage[]) ?? []),
      { direction, text, at: new Date().toISOString() },
    ];
    return this.prisma.screeningConversation.update({
      where: { id },
      data: {
        transcript: transcript as unknown as object,
        ...(isInbound ? { lastInboundAt: new Date() } : {}),
      },
    });
  }

  private async pushCandidateQuestion(row: ScreeningConversation, question: string): Promise<void> {
    const meta = ((row.meta as unknown as ConversationMeta) ?? {}) as ConversationMeta;
    const questions = [...(meta.candidateQuestions ?? []), question];
    await this.prisma.screeningConversation.update({
      where: { id: row.id },
      data: { meta: { ...meta, candidateQuestions: questions } as unknown as object },
    });
  }

  private flowCtx(row: ScreeningConversation): FlowContext {
    const meta = (row.meta as unknown as ConversationMeta) ?? {};
    return (
      meta.flow ?? {
        candidateName: 'there',
        jdTitle: 'the role',
        clientName: null,
        jdLocation: null,
        workMode: null,
        candidateLocation: null,
        currentRole: null,
      }
    );
  }

  private toDto(row: ConversationWithRefs): ScreeningConversationDto {
    return {
      id: row.id,
      candidateId: row.candidateId,
      candidateName: row.candidate?.fullName,
      jdId: row.jdId,
      jdTitle: row.jd?.title,
      status: row.status,
      currentStepKey: row.currentStepKey,
      steps: (row.steps as unknown as ScreeningStep[]) ?? [],
      answers: (row.answers as unknown as ScreeningAnswer[]) ?? [],
      transcript: (row.transcript as unknown as ScreeningMessage[]) ?? [],
      brief: (row.brief as unknown as PreCallBrief | null) ?? null,
      consentCaptured: row.consentCaptured,
      lastInboundAt: row.lastInboundAt ? row.lastInboundAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

// ------------------------------------------------------------------ utils

/** "+919812345678" | "9812345678" | "91 98123-45678" → "+919812345678". */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (raw.trim().startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) return `+91${digits}`; // bare Indian mobile number
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}

function quickYesNo(reply: string): boolean | null {
  const t = reply.trim().toLowerCase().replace(/[.!]+$/, '');
  if (/^(yes|y|yeah|yep|ok|okay|sure|confirm|correct|right|haan|ha|ji|ji haan|agree|interested)$/.test(t)) return true;
  if (/^(no|n|nope|nahi|nah|not interested|incorrect|wrong|galat)$/.test(t)) return false;
  return null;
}

function inviteStep(): ScreeningStep {
  return {
    key: '__invite__',
    kind: 'yes_no',
    question: 'Reply YES to continue with a short pre-screening chat, or STOP to opt out.',
  };
}

/** Leading yes/no in a longer reply: "yes correct", "no, I moved to Pune". */
function leadingYesNo(reply: string): boolean | null {
  const quick = quickYesNo(reply);
  if (quick !== null) return quick;
  const t = reply.trim().toLowerCase();
  if (/^(yes|yeah|yep|ok|okay|sure|confirm|correct|right|haan|ji)\b/.test(t)) return true;
  if (/^(no|nope|nahi|nah|incorrect|wrong|galat)\b/.test(t)) return false;
  return null;
}

/** No-AI fallback parsing so a provider outage never breaks the conversation. */
export function heuristicInterpretation(step: ScreeningStep, reply: string): WaReplyInterpretation {
  const yesNo = leadingYesNo(reply);
  let numberValue: number | null = null;
  let wantedNumber = false;

  const extract = step.extract ?? '';
  const text = reply.toLowerCase();
  if (extract.includes('days')) {
    wantedNumber = true;
    if (/immediate|serving.*(over|done)|joined? anytime/.test(text)) numberValue = 0;
    const months = /(\d+(?:\.\d+)?)\s*month/.exec(text);
    const days = /(\d+)\s*day/.exec(text);
    if (days) numberValue = parseInt(days[1], 10);
    else if (months) numberValue = Math.round(parseFloat(months[1]) * 30);
  } else if (extract.includes('lakhs')) {
    wantedNumber = true;
    const lpa = /(\d+(?:\.\d+)?)\s*(?:lpa|lakh|lac|l\b)/.exec(text);
    if (lpa) numberValue = parseFloat(lpa[1]);
  } else if (extract.includes('offers') || /count/i.test(extract)) {
    wantedNumber = true;
    if (/^(no|none|nahi|0)\b/.test(text)) numberValue = 0;
    else {
      const n = /(\d+)\s*offer/.exec(text);
      if (n) numberValue = parseInt(n[1], 10);
    }
  }

  // Flag only when the fallback failed to extract what the step needed —
  // clean captures don't need recruiter attention just because AI was down.
  const extractionFailed =
    (wantedNumber && numberValue === null) || (step.kind === 'yes_no' && yesNo === null);

  return {
    intent: 'answer',
    yesNo,
    value: reply.trim(),
    numberValue,
    candidateQuestion: null,
    flag: extractionFailed ? 'Parsed without AI assistance — review the raw reply' : null,
  };
}

function labelForStep(key: string): string {
  const labels: Record<string, string> = {
    interest: 'Interest',
    notice_period: 'Notice period',
    current_ctc: 'Current CTC',
    expected_ctc: 'Expected CTC',
    location: 'Location',
    offers_in_hand: 'Offers in hand',
    reason_for_change: 'Reason for change',
    claim_current_role: 'Current role claim',
    call_slot: 'Call slot',
  };
  return labels[key] ?? key;
}
