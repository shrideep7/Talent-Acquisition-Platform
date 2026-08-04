import type { ScreeningStep } from '@mfd/shared';
import type { FlowContext } from '../whatsapp/screening-flow';

/**
 * The pre-screening email. Deliberately concise: two lines of context, one
 * button, and the same questions numbered inline so the candidate can simply
 * reply to the email instead of using the form.
 */
export function buildPrescreenEmail(
  ctx: FlowContext,
  steps: ScreeningStep[],
  formUrl: string,
): { subject: string; text: string; html: string } {
  const first = ctx.candidateName.trim().split(/\s+/)[0] ?? ctx.candidateName;
  const client = ctx.clientName ? ` at ${ctx.clientName}` : '';
  const subject = `${ctx.jdTitle}${client} — 2-minute pre-screen | MFD Talent`;

  // Strip WhatsApp markup (*bold*, emoji option markers) for email use.
  const questions = steps.map((s) => s.question.replace(/\*/g, '').replace(/\n[123]️⃣ /g, '\n   - '));

  const text = [
    `Hi ${first},`,
    '',
    `MFD Talent${ctx.clientName ? ` (staffing partner of ${ctx.clientName})` : ''} is considering your profile for the role of ${ctx.jdTitle}${ctx.jdLocation ? ` in ${ctx.jdLocation}` : ''}.`,
    '',
    `Before our recruiter calls you, please answer a few quick questions — it takes about 2 minutes:`,
    '',
    `Answer online (fastest): ${formUrl}`,
    '',
    `Or simply reply to this email with your answers:`,
    '',
    ...questions.map((q, i) => `${i + 1}. ${q}`),
    '',
    `Your answers are stored securely by MFD and used only for this hiring process. If you'd rather not be contacted, reply "unsubscribe".`,
    '',
    `Best regards,`,
    `Team MFD Talent`,
  ].join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:620px;margin:0 auto">
  <p>Hi ${escapeHtml(first)},</p>
  <p>MFD Talent${ctx.clientName ? ` (staffing partner of <strong>${escapeHtml(ctx.clientName)}</strong>)` : ''} is considering your profile for the role of <strong>${escapeHtml(ctx.jdTitle)}</strong>${ctx.jdLocation ? ` in ${escapeHtml(ctx.jdLocation)}` : ''}.</p>
  <p>Before our recruiter calls you, please answer a few quick questions — it takes about 2 minutes:</p>
  <p style="margin:24px 0">
    <a href="${formUrl}" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block">Answer the questions online</a>
  </p>
  <p style="color:#555">Or simply reply to this email with your answers:</p>
  <ol style="color:#333">
    ${questions.map((q) => `<li style="margin-bottom:8px">${escapeHtml(q).replace(/\n/g, '<br/>')}</li>`).join('\n    ')}
  </ol>
  <p style="font-size:12px;color:#888">Your answers are stored securely by MFD and used only for this hiring process. If you'd rather not be contacted, reply "unsubscribe".</p>
  <p>Best regards,<br/>Team MFD Talent</p>
</div>`.trim();

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
