import type { HrScreeningCall, InterviewPrep, UpskillingPlan } from '@mfd/shared';

/**
 * Per-section download: opens a minimal print window containing ONLY the
 * chosen section (no app chrome, no scores) — the browser's print dialog
 * lets the recruiter save it as a PDF.
 */

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PRINT_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.55; color: #111; max-width: 760px; margin: 24px auto; padding: 0 16px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin: 0 0 20px; }
  h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .q { margin: 0 0 16px; page-break-inside: avoid; }
  .q p { margin: 2px 0; }
  .qt { font-weight: bold; }
  .muted { color: #555; }
  .good { color: #14532d; }
  .bad { color: #7f1d1d; }
  ul, ol { margin: 4px 0 8px; padding-left: 22px; }
  li { margin: 2px 0; }
  .chips { margin: 2px 0 10px; }
  .tag { font-size: 11px; color: #444; border: 1px solid #bbb; border-radius: 10px; padding: 1px 8px; margin-right: 4px; }
  .box { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; margin: 8px 0; page-break-inside: avoid; }
  .pre { white-space: pre-wrap; }
`;

export function openPrintWindow(title: string, bodyHtml: string): boolean {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return false;
  win.document.write(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title)}</title>` +
      `<style>${PRINT_STYLE}</style></head><body>` +
      `<h1>${esc(title)}</h1><p class="sub">MFD Talent Acquisition Tool — generated ${new Date().toLocaleDateString()}</p>` +
      bodyHtml +
      `<script>window.onload = function () { window.print(); };</script></body></html>`,
  );
  win.document.close();
  return true;
}

function list(items: string[], cls = ''): string {
  if (items.length === 0) return '';
  return `<ul${cls ? ` class="${cls}"` : ''}>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

// ---------------------------------------------------------------- sections

export function hrCallHtml(call: HrScreeningCall): string {
  const parts: string[] = [];
  if (call.callOpening.length > 0) {
    parts.push(`<h2>Opening the call</h2>${list(call.callOpening.map((l) => `“${l}”`))}`);
  }
  parts.push('<h2>Verification questions</h2>');
  call.questions.forEach((q, i) => {
    parts.push(
      `<div class="q">` +
        `<p class="qt">${i + 1}. ${esc(q.question)} <span class="tag">${esc(q.area)}</span></p>` +
        `<p class="muted">Checks: ${esc(q.claim)}</p>` +
        `<p class="good">Genuine answer sounds like: ${esc(q.genuineAnswer)}</p>` +
        (q.redFlags.length > 0 ? `<p class="bad">Red flags:</p>${list(q.redFlags)}` : '') +
        (q.followUp ? `<p class="muted">If vague, ask: “${esc(q.followUp)}”</p>` : '') +
        `</div>`,
    );
  });
  if (call.logisticsChecklist.length > 0) {
    parts.push(`<h2>Before closing — confirm</h2>${list(call.logisticsChecklist)}`);
  }
  if (call.verdictGuidance.length > 0) {
    parts.push(`<h2>After the call — how to judge</h2>${list(call.verdictGuidance)}`);
  }
  return parts.join('');
}

export function likelyQuestionsHtml(questions: InterviewPrep['likelyQuestions']): string {
  return questions
    .map(
      (q, i) =>
        `<div class="q">` +
        `<p class="qt">${i + 1}. ${esc(q.question)} <span class="tag">${esc(q.category.replace(/_/g, ' '))}</span></p>` +
        `<p class="muted">Why: ${esc(q.basis)}</p>` +
        (q.prepPoints.length > 0 ? `<p>Prep points:</p>${list(q.prepPoints)}` : '') +
        `</div>`,
    )
    .join('');
}

export function screeningHtml(questions: InterviewPrep['screeningQuestions']): string {
  return questions
    .map(
      (q, i) =>
        `<div class="q">` +
        `<p class="qt">${i + 1}. ${esc(q.question)}</p>` +
        `<p class="muted">${esc(q.purpose)}</p>` +
        (q.listenFor.length > 0 ? `<p class="good">Listen for:</p>${list(q.listenFor)}` : '') +
        (q.redFlags.length > 0 ? `<p class="bad">Red flags:</p>${list(q.redFlags)}` : '') +
        `</div>`,
    )
    .join('');
}

export interface SkillsSnapshot {
  matched: string[];
  partial: string[];
  missing: string[];
}

export function upskillingHtml(plan: UpskillingPlan, skills?: SkillsSnapshot): string {
  const parts: string[] = [];

  // Skill segments from the match analysis — lists only, no scores.
  if (skills) {
    parts.push('<h2>Skills match snapshot</h2>');
    parts.push(`<p class="qt">Matched (${skills.matched.length})</p>${list(skills.matched) || '<p class="muted">None</p>'}`);
    parts.push(`<p class="qt">Partial (${skills.partial.length})</p>${list(skills.partial) || '<p class="muted">None</p>'}`);
    parts.push(`<p class="qt">Missing (${skills.missing.length})</p>${list(skills.missing) || '<p class="muted">None</p>'}`);
  }

  parts.push('<h2>Upskilling plan</h2>');
  parts.push(`<p>${esc(plan.summary)}</p>`);
  plan.items.forEach((item) => {
    parts.push(
      `<div class="box">` +
        `<p class="qt">${esc(item.skill)} <span class="tag">${esc(item.priority.replace(/_/g, ' '))}</span><span class="tag">learnable in ${esc(item.learnability)}</span></p>` +
        `<p class="muted">${esc(item.whyItMatters)}</p>` +
        (item.leverageExisting ? `<p class="good">Head start: ${esc(item.leverageExisting)}</p>` : '') +
        (item.learningPath.length > 0
          ? `<p>Learning path:</p><ol>${item.learningPath.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`
          : '') +
        `<p><b>Build this:</b> ${esc(item.handsOnExercise)}</p>` +
        (item.interviewQuestions.length > 0
          ? `<p>Practice questions:</p>${item.interviewQuestions
              .map((q) => `<p class="qt">${esc(q.question)}</p><p class="muted">${esc(q.guidance)}</p>`)
              .join('')}`
          : '') +
        `</div>`,
    );
  });

  if (plan.candidateMessage) {
    parts.push(`<h2>Message for the candidate</h2><p class="pre">${esc(plan.candidateMessage)}</p>`);
  }
  return parts.join('');
}
