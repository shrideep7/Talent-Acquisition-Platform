'use client';

import * as React from 'react';
import { diffLines } from 'diff';
import type { GeneratedCv } from '@mfd/shared';

import { cn } from '@/lib/utils';

/** Plain-text rendering of a GeneratedCv, mirroring the exported document sections. */
export function renderCvText(content: GeneratedCv): string {
  const lines: string[] = [];

  lines.push(content.fullName);
  if (content.headline) lines.push(content.headline);
  const contact = [content.contact.email, content.contact.phone, content.contact.location]
    .filter(Boolean)
    .join(' | ');
  if (contact) lines.push(contact);
  lines.push('');

  if (content.summary) {
    lines.push('SUMMARY');
    lines.push(content.summary);
    lines.push('');
  }

  if (content.skills.length > 0) {
    lines.push('SKILLS');
    for (const cat of content.skills) {
      lines.push(`${cat.category}: ${cat.items.join(', ')}`);
    }
    lines.push('');
  }

  if (content.experience.length > 0) {
    lines.push('EXPERIENCE');
    for (const role of content.experience) {
      const dates = `${role.startDate ?? '?'} – ${role.endDate ?? 'Present'}`;
      lines.push(
        `${role.title} — ${role.employer}${role.location ? `, ${role.location}` : ''} (${dates})`,
      );
      for (const bullet of role.bullets) lines.push(`• ${bullet}`);
      lines.push('');
    }
  }

  if (content.education.length > 0) {
    lines.push('EDUCATION');
    for (const edu of content.education) {
      lines.push([edu.degree, edu.institution, edu.year].filter(Boolean).join(', '));
    }
    lines.push('');
  }

  if (content.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const cert of content.certifications) {
      lines.push([cert.name, cert.issuer, cert.year].filter(Boolean).join(', '));
    }
    lines.push('');
  }

  if (content.projects.length > 0) {
    lines.push('PROJECTS');
    for (const project of content.projects) {
      lines.push(
        project.name +
          (project.technologies.length > 0 ? ` [${project.technologies.join(', ')}]` : ''),
      );
      if (project.description) lines.push(project.description);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

export interface DiffViewProps {
  /** Original CV plain text (from the source CV document). */
  original: string;
  /** Generated/edited CV content, rendered to text before diffing. */
  content: GeneratedCv;
  className?: string;
}

/** Line diff between the original CV text and the generated version. */
export function DiffView({ original, content, className }: DiffViewProps) {
  const parts = React.useMemo(
    () => diffLines(original.trim() + '\n', renderCvText(content)),
    [original, content],
  );

  return (
    <div
      className={cn(
        'max-h-[520px] overflow-auto rounded-md border bg-muted/20 font-mono text-xs leading-relaxed',
        className,
      )}
    >
      <pre className="min-w-max p-3">
        {parts.map((part, i) => {
          const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';
          const lines = part.value.replace(/\n$/, '').split('\n');
          return (
            <div
              key={i}
              className={cn(
                part.added &&
                  'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
                part.removed && 'bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-200',
              )}
            >
              {lines.map((line, j) => (
                <div key={j}>
                  {prefix}
                  {line}
                </div>
              ))}
            </div>
          );
        })}
      </pre>
    </div>
  );
}
