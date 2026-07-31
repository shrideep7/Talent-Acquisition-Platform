import type { GeneratedCv } from '@mfd/shared';

/**
 * Plain-text rendering of a generated CV. Used as the cvText input for the
 * scoring engine's exact keyword matching — mirrors the exported document
 * structure: headings, one bullet per line, contact line.
 */
export function renderGeneratedCvText(cv: GeneratedCv): string {
  const lines: string[] = [];

  lines.push(cv.fullName);
  if (cv.headline && cv.headline.trim()) lines.push(cv.headline.trim());
  const contact = [cv.contact.email, cv.contact.phone, cv.contact.location].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  if (contact.length > 0) lines.push(contact.join(' | '));

  if (cv.summary.trim()) {
    lines.push('', 'SUMMARY', cv.summary.trim());
  }

  if (cv.skills.length > 0) {
    lines.push('', 'SKILLS');
    for (const group of cv.skills) {
      lines.push(`${group.category}: ${group.items.join(', ')}`);
    }
  }

  if (cv.experience.length > 0) {
    lines.push('', 'EXPERIENCE');
    for (const role of cv.experience) {
      lines.push('', `${role.title} — ${role.employer}`);
      const dates = [role.startDate, role.endDate]
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .join(' – ');
      const meta = [dates, role.location ?? ''].filter((v) => v.length > 0).join(' | ');
      if (meta) lines.push(meta);
      for (const bullet of role.bullets) lines.push(`- ${bullet}`);
    }
  }

  if (cv.education.length > 0) {
    lines.push('', 'EDUCATION');
    for (const edu of cv.education) {
      lines.push(
        [edu.degree, edu.institution ?? '', edu.year ?? ''].filter((v) => v.length > 0).join(', '),
      );
    }
  }

  if (cv.certifications.length > 0) {
    lines.push('', 'CERTIFICATIONS');
    for (const cert of cv.certifications) {
      lines.push(
        [cert.name, cert.issuer ?? '', cert.year ?? ''].filter((v) => v.length > 0).join(', '),
      );
    }
  }

  if (cv.projects.length > 0) {
    lines.push('', 'PROJECTS');
    for (const project of cv.projects) {
      const tech = project.technologies.length > 0 ? ` (${project.technologies.join(', ')})` : '';
      lines.push(`${project.name}${project.description ? `: ${project.description}` : ''}${tech}`);
    }
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}
