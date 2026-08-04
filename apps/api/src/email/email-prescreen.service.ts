import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { ScreeningConversation } from '@prisma/client';
import { randomBytes } from 'crypto';
import { EmailReplyParseSchema } from '@mfd/shared';
import type {
  ParsedCv,
  ParsedJd,
  PrescreenFormDto,
  ScreeningAnswer,
  ScreeningConversationDto,
  ScreeningStep,
} from '@mfd/shared';
import { LlmService } from '../ai/llm.service';
import { AuditService } from '../common/audit.service';
import { CryptoService } from '../common/crypto.service';
import type { AuthUser } from '../common/decorators';
import { PrismaService } from '../common/prisma.service';
import { buildSteps, normalizeCallSlot, type FlowContext } from '../whatsapp/screening-flow';
import { WhatsappScreeningService } from '../whatsapp/whatsapp-screening.service';
import { buildPrescreenEmail } from './email-content';
import { MailService } from './mail.service';

const ACTIVE_STATUSES = ['INVITED', 'IN_PROGRESS'] as const;

/**
 * Email channel of the pre-screen: one concise email (from hiring@…) with a
 * secure response-form link plus the questions inline. Answers come back
 * either through the public form (structured, preferred) or as an email
 * reply the recruiter pastes in for parsing. Brief building, candidate
 * updates and pipeline advancement are shared with the WhatsApp channel.
 */
@Injectable()
export class EmailPrescreenService {
  private readonly logger = new Logger(EmailPrescreenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly llm: LlmService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly whatsapp: WhatsappScreeningService,
    private readonly config: ConfigService,
  ) {}

  get mode() {
    return this.mail.mode;
  }

  async start(
    input: { candidateId: string; jdId: string; email?: string },
    user: AuthUser,
  ): Promise<ScreeningConversationDto> {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: input.candidateId, deletedAt: null },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    if (candidate.consentStatus === 'REVOKED') {
      throw new UnprocessableEntityException('Candidate has revoked consent — do not contact them');
    }

    const jd = await this.prisma.jd.findFirst({ where: { id: input.jdId, deletedAt: null } });
    if (!jd) throw new NotFoundException('JD not found');

    const email = input.email?.trim() || this.crypto.decrypt(candidate.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException(
        'Candidate has no valid email on file — provide one to start the email pre-screen',
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
        'A pre-screen for this candidate and JD is already running — cancel it first to restart',
      );
    }

    const parsedJd = jd.parsedCriteria ? (jd.parsedCriteria as unknown as ParsedJd) : null;
    const latestDoc = await this.prisma.cvDocument.findFirst({
      where: { candidateId: candidate.id, parsedCv: { not: Prisma.AnyNull } },
      orderBy: { createdAt: 'desc' },
      select: { parsedCv: true },
    });
    const parsedCv = latestDoc?.parsedCv ? (latestDoc.parsedCv as unknown as ParsedCv) : null;
    const currentRole = parsedCv?.roles.find((r) => r.isCurrent) ?? parsedCv?.roles[0] ?? null;

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
    const formToken = randomBytes(24).toString('base64url');
    const webUrl = (this.config.get<string>('WEB_PUBLIC_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    const formUrl = `${webUrl}/prescreen/${formToken}`;
    const composed = buildPrescreenEmail(ctx, steps, formUrl);

    const conversation = await this.prisma.screeningConversation.create({
      data: {
        candidateId: candidate.id,
        jdId: jd.id,
        channel: 'EMAIL',
        email: this.crypto.encrypt(email) as string,
        formToken,
        steps: steps as unknown as object,
        meta: { candidateQuestions: [], flow: ctx } as unknown as object,
        createdById: user.id,
      },
    });

    const sent = await this.mail.send({
      to: email,
      subject: composed.subject,
      text: composed.text,
      html: composed.html,
    });
    if (!sent.ok) {
      await this.prisma.screeningConversation.update({
        where: { id: conversation.id },
        data: { status: 'NEEDS_HUMAN' },
      });
      throw new UnprocessableEntityException(`Pre-screen email could not be sent: ${sent.error}`);
    }
    await this.whatsapp.appendTranscript(
      conversation.id,
      'out',
      `📧 Subject: ${composed.subject}\n\n${composed.text}`,
    );

    await this.audit.log({
      userId: user.id,
      action: 'WA_SCREENING_STARTED',
      entityType: 'screening_conversation',
      entityId: conversation.id,
      detail: { candidateId: candidate.id, jdId: jd.id, channel: 'email', mode: this.mail.mode },
    });

    return this.whatsapp.getOne(conversation.id);
  }

  // ------------------------------------------------------------ public form

  async getForm(token: string): Promise<PrescreenFormDto> {
    const row = await this.findByToken(token);
    const meta = row.meta as unknown as { flow?: FlowContext };
    const steps = (row.steps as unknown as ScreeningStep[]) ?? [];
    const fullName = meta.flow?.candidateName ?? 'there';
    return {
      candidateFirstName: fullName.trim().split(/\s+/)[0] ?? fullName,
      jdTitle: meta.flow?.jdTitle ?? 'the role',
      clientName: meta.flow?.clientName ?? null,
      status: row.status,
      questions: steps.map((s) => ({
        key: s.key,
        kind: s.kind,
        // The form renders plain text — drop WhatsApp bold markers.
        question: s.question.replace(/\*/g, ''),
      })),
    };
  }

  async submitForm(
    token: string,
    input: { consent: boolean; answers: Record<string, string> },
  ): Promise<{ ok: true }> {
    const row = await this.findByToken(token);
    if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
      throw new ConflictException('This pre-screen has already been submitted or closed');
    }
    if (!input.consent) {
      throw new BadRequestException('Consent is required to submit the pre-screen');
    }

    const steps = (row.steps as unknown as ScreeningStep[]) ?? [];
    const answers: ScreeningAnswer[] = [];
    for (const step of steps) {
      const reply = input.answers[step.key]?.trim();
      if (!reply) continue;
      const parsed = await this.whatsapp.interpretWithFallback(row, step, reply);
      const rawValue = parsed.value ?? reply;
      answers.push({
        stepKey: step.key,
        raw: reply,
        value: step.key === 'call_slot' ? normalizeCallSlot(rawValue) : rawValue,
        numberValue: parsed.numberValue,
        yesNo: parsed.yesNo,
        flag: parsed.flag,
      });
    }
    if (answers.length === 0) {
      throw new BadRequestException('Please answer at least one question');
    }

    const summary = answers.map((a) => `${a.stepKey}: ${a.raw}`).join('\n');
    await this.whatsapp.appendTranscript(row.id, 'in', `📝 Form submitted:\n${summary}`, true);
    await this.completeWithAnswers(row.id, answers, { viaForm: true });
    return { ok: true };
  }

  // ------------------------------------------------------- pasted email reply

  /** Recruiter pastes the candidate's email reply; one LLM pass maps it to the questions. */
  async recordReply(id: string, replyText: string, user: AuthUser): Promise<ScreeningConversationDto> {
    const row = await this.prisma.screeningConversation.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Pre-screen conversation not found');
    if (row.channel !== 'EMAIL') {
      throw new BadRequestException('Reply recording applies to email pre-screens only');
    }
    if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
      throw new ConflictException('This pre-screen is already completed or closed');
    }

    const steps = (row.steps as unknown as ScreeningStep[]) ?? [];
    const meta = row.meta as unknown as { flow?: FlowContext; candidateQuestions?: string[] };

    const result = await this.llm.structured({
      promptName: 'email-reply-parse',
      schema: EmailReplyParseSchema,
      schemaVersion: 'v1',
      candidateId: row.candidateId,
      userContent: JSON.stringify({
        steps: steps.map((s) => ({
          key: s.key,
          kind: s.kind,
          question: s.question,
          claim: s.claim ?? null,
          extract: s.extract ?? null,
        })),
        reply: replyText,
        candidateName: meta.flow?.candidateName ?? '',
      }),
    });

    const stepKeys = new Set(steps.map((s) => s.key));
    const answers: ScreeningAnswer[] = result.data.answers
      .filter((a) => stepKeys.has(a.stepKey))
      .map((a) => ({
        stepKey: a.stepKey,
        raw: a.value ?? '',
        value: a.stepKey === 'call_slot' ? normalizeCallSlot(a.value) : a.value,
        numberValue: a.numberValue,
        yesNo: a.yesNo,
        flag: a.flag,
      }));
    if (answers.length === 0) {
      throw new UnprocessableEntityException(
        'No answers to the pre-screen questions could be found in that reply — review it manually',
      );
    }

    if (result.data.candidateQuestions.length > 0) {
      await this.prisma.screeningConversation.update({
        where: { id: row.id },
        data: {
          meta: {
            ...meta,
            candidateQuestions: [
              ...(meta.candidateQuestions ?? []),
              ...result.data.candidateQuestions,
            ],
          } as unknown as object,
        },
      });
    }

    await this.whatsapp.appendTranscript(row.id, 'in', `📧 Email reply (recorded by recruiter):\n${replyText}`, true);
    // An emailed reply is a knowing response to the consent notice in our mail.
    await this.completeWithAnswers(row.id, answers, { viaForm: false, recordedBy: user.id });
    return this.whatsapp.getOne(row.id);
  }

  // ---------------------------------------------------------------- shared

  private async completeWithAnswers(
    conversationId: string,
    answers: ScreeningAnswer[],
    detail: { viaForm: boolean; recordedBy?: string },
  ): Promise<void> {
    const interest = answers.find((a) => a.stepKey === 'interest');
    const declined = interest?.yesNo === false;

    let row = await this.prisma.screeningConversation.update({
      where: { id: conversationId },
      data: {
        answers: answers as unknown as object,
        consentCaptured: true,
        currentStepKey: null,
      },
    });

    await this.prisma.candidate.updateMany({
      where: { id: row.candidateId, consentStatus: 'PENDING' },
      data: {
        consentStatus: 'GRANTED',
        consentAt: new Date(),
        consentNote: detail.viaForm
          ? 'Granted via email pre-screen response form'
          : 'Granted via email pre-screen reply',
      },
    });
    await this.audit.log({
      userId: detail.recordedBy ?? null,
      action: 'CONSENT_RECORDED',
      entityType: 'candidate',
      entityId: row.candidateId,
      detail: { granted: true, via: detail.viaForm ? 'email_prescreen_form' : 'email_prescreen_reply' },
    });

    const brief = this.whatsapp.buildBrief(row);
    row = await this.prisma.screeningConversation.update({
      where: { id: conversationId },
      data: { status: declined ? 'DECLINED' : 'COMPLETED', brief: brief as unknown as object },
    });
    await this.whatsapp.applyBriefToRecords(row, brief);

    await this.audit.log({
      userId: detail.recordedBy ?? null,
      action: 'WA_SCREENING_COMPLETED',
      entityType: 'screening_conversation',
      entityId: conversationId,
      detail: {
        candidateId: row.candidateId,
        jdId: row.jdId,
        channel: 'email',
        declined,
        via: detail.viaForm ? 'form' : 'pasted_reply',
      },
    });
  }

  private async findByToken(token: string): Promise<ScreeningConversation> {
    if (!token || token.length < 16) throw new NotFoundException('Pre-screen not found');
    const row = await this.prisma.screeningConversation.findUnique({ where: { formToken: token } });
    if (!row) throw new NotFoundException('Pre-screen not found');
    return row;
  }
}
