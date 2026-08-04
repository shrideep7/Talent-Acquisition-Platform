import type { FlowContext } from '../whatsapp/screening-flow';

/**
 * The pre-screening email. Deliberately short: two lines of context and one
 * link — the questions live in the linked form (a Google Form via
 * PRESCREEN_FORM_URL, or the built-in /prescreen/<token> page), never in the
 * email body.
 */
export function buildPrescreenEmail(
  ctx: FlowContext,
  formUrl: string,
): { subject: string; text: string; html: string } {
  const first = ctx.candidateName.trim().split(/\s+/)[0] ?? ctx.candidateName;
  const client = ctx.clientName ? ` at ${ctx.clientName}` : '';
  const subject = `${ctx.jdTitle}${client} — 2-minute pre-screen | MFD`;
  const location = ctx.jdLocation ? ` in ${ctx.jdLocation}` : '';

  const text = [
    `Hi ${first},`,
    '',
    `MFD is considering your profile for the role of ${ctx.jdTitle}${location}.`,
    '',
    `Before our recruiter calls you, please answer a few quick questions — it takes about 2 minutes:`,
    '',
    `Answer online (fastest): ${formUrl}`,
    '',
    `Your answers are stored securely by MFD and used only for this hiring process. If you'd rather not be contacted, reply "unsubscribe".`,
    '',
    `Best regards,`,
    `Team MFD`,
  ].join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:620px;margin:0 auto">
  <p>Hi ${escapeHtml(first)},</p>
  <p>MFD is considering your profile for the role of <strong>${escapeHtml(ctx.jdTitle)}</strong>${location ? escapeHtml(location) : ''}.</p>
  <p>Before our recruiter calls you, please answer a few quick questions — it takes about 2 minutes:</p>
  <p style="margin:24px 0">
    <a href="${formUrl}" style="background:#0f172a;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:bold;display:inline-block">Answer the questions online</a>
  </p>
  <p style="font-size:12px;color:#888">If the button doesn't work, open this link: <a href="${formUrl}">${formUrl}</a></p>
  <p style="font-size:12px;color:#888">Your answers are stored securely by MFD and used only for this hiring process. If you'd rather not be contacted, reply "unsubscribe".</p>
  <p>Best regards,<br/>Team MFD</p>
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
