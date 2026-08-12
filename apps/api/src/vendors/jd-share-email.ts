import type { ParsedJd } from '@mfd/shared';

export interface JdShareEmailInput {
  vendorContactName: string;
  vendorCompanyName: string;
  jdTitle: string;
  /** Null when the client is masked (the default — vendors shouldn't go direct). */
  clientName: string | null;
  parsed: ParsedJd | null;
  rawText: string;
  /** Recruiter's own note prepended to the requirement details. */
  note: string | null;
  /** Where vendors should send profiles. */
  replyTo: string;
  hasAttachment: boolean;
}

/**
 * The requirement email sent to one vendor. Personalized per vendor (never a
 * shared CC/BCC blast — vendors must not see each other's addresses), with
 * the parsed criteria rendered as a scannable spec so an agency recruiter can
 * start sourcing without opening an attachment.
 */
export function buildJdShareEmail(input: JdShareEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const p = input.parsed;
  const first = input.vendorContactName.trim().split(/\s+/)[0] || input.vendorContactName;

  const location = p?.location ?? null;
  const exp = experienceLine(p);
  const mustHave = p?.requiredSkills.filter((s) => s.importance === 'must_have').map((s) => s.name) ?? [];
  const niceToHave = p?.requiredSkills.filter((s) => s.importance === 'nice_to_have').map((s) => s.name) ?? [];

  const subjectBits = [input.jdTitle, exp, location].filter(Boolean);
  const subject = `Requirement: ${subjectBits.join(' | ')}`;

  const specRows: [string, string][] = [];
  if (input.clientName) specRows.push(['Client', input.clientName]);
  if (p?.seniorityLevel) specRows.push(['Seniority', p.seniorityLevel]);
  if (exp) specRows.push(['Experience', exp]);
  if (location) specRows.push(['Location', location]);
  if (p?.workMode && p.workMode !== 'unspecified') specRows.push(['Work mode', p.workMode]);
  if (p?.noticePeriod) specRows.push(['Notice period', p.noticePeriod]);
  if (p?.budget) specRows.push(['Budget', p.budget]);
  if (p?.domain) specRows.push(['Domain', p.domain]);

  const textParts: string[] = [
    `Hi ${first},`,
    '',
    `We have an open requirement and would like your help sourcing profiles.`,
    '',
    `ROLE: ${input.jdTitle}`,
  ];
  if (input.note?.trim()) textParts.push('', input.note.trim());
  if (specRows.length > 0) {
    textParts.push('', ...specRows.map(([k, v]) => `${k}: ${v}`));
  }
  if (mustHave.length > 0) textParts.push('', `Must-have skills: ${mustHave.join(', ')}`);
  if (niceToHave.length > 0) textParts.push(`Good to have: ${niceToHave.join(', ')}`);
  if (p?.educationRequirements.length) {
    textParts.push(`Education: ${p.educationRequirements.join(', ')}`);
  }
  textParts.push(
    '',
    'HOW TO SHARE PROFILES',
    `- Reply to this email (${input.replyTo}) with CVs attached.`,
    '- Please include current CTC, expected CTC, notice period and current location for each profile.',
    '- Send only profiles with the candidate\'s consent to share with our client.',
    '',
    input.hasAttachment
      ? 'The full job description is attached.'
      : 'Full job description below:',
  );
  if (!input.hasAttachment) {
    textParts.push('', '---', input.rawText.trim());
  }
  textParts.push('', 'Thanks and regards,', 'Talent Acquisition Team');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:640px;margin:0 auto">
  <p>Hi ${esc(first)},</p>
  <p>We have an open requirement and would like your help sourcing profiles.</p>
  <h2 style="font-size:17px;margin:20px 0 8px">${esc(input.jdTitle)}</h2>
  ${input.note?.trim() ? `<p style="background:#fffbeb;border-left:3px solid #f59e0b;padding:8px 12px;margin:12px 0">${esc(input.note.trim()).replace(/\n/g, '<br/>')}</p>` : ''}
  ${
    specRows.length > 0
      ? `<table cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:14px">
    ${specRows
      .map(
        ([k, v]) =>
          `<tr><td style="color:#666;border-bottom:1px solid #eee">${esc(k)}</td><td style="font-weight:bold;border-bottom:1px solid #eee">${esc(v)}</td></tr>`,
      )
      .join('\n    ')}
  </table>`
      : ''
  }
  ${mustHave.length > 0 ? `<p><b>Must-have skills:</b> ${esc(mustHave.join(', '))}</p>` : ''}
  ${niceToHave.length > 0 ? `<p><b>Good to have:</b> ${esc(niceToHave.join(', '))}</p>` : ''}
  ${p?.educationRequirements.length ? `<p><b>Education:</b> ${esc(p.educationRequirements.join(', '))}</p>` : ''}
  <div style="background:#f6f7f9;border-radius:6px;padding:12px 16px;margin:20px 0">
    <p style="margin:0 0 6px"><b>How to share profiles</b></p>
    <ul style="margin:0;padding-left:20px">
      <li>Reply to this email (<a href="mailto:${esc(input.replyTo)}">${esc(input.replyTo)}</a>) with CVs attached.</li>
      <li>Include current CTC, expected CTC, notice period and current location for each profile.</li>
      <li>Send only profiles with the candidate's consent to share with our client.</li>
    </ul>
  </div>
  ${
    input.hasAttachment
      ? `<p style="color:#555">The full job description is attached.</p>`
      : `<p style="color:#555"><b>Full job description</b></p><pre style="white-space:pre-wrap;font-family:inherit;background:#f6f7f9;border-radius:6px;padding:12px 16px">${esc(input.rawText.trim())}</pre>`
  }
  <p>Thanks and regards,<br/>Talent Acquisition Team</p>
</div>`.trim();

  return { subject, text: textParts.join('\n'), html };
}

function experienceLine(p: ParsedJd | null): string | null {
  if (!p) return null;
  const { minYearsExperience: min, maxYearsExperience: max } = p;
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}-${max} yrs`;
  if (min !== null) return `${min}+ yrs`;
  return `up to ${max} yrs`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
