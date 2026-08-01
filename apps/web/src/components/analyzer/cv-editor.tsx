'use client';

import * as React from 'react';
import type { GeneratedCv } from '@mfd/shared';
import { Download, Loader2, Lock, Plus, Save, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface CvEditorProps {
  /** The version content being edited. Re-mount (via key) when the version changes. */
  value: GeneratedCv;
  saving: boolean;
  /** VIEWER gets a read-only editor with no save/export. */
  canMutate: boolean;
  onSave: (content: GeneratedCv) => void;
  onExport: (format: 'docx' | 'pdf') => void;
  exporting?: boolean;
}

function LockedFact({
  children,
  message = 'Employment facts are immutable — integrity guardrail',
  className,
}: {
  children: React.ReactNode;
  message?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex max-w-full cursor-default items-center gap-1.5 rounded-md bg-muted/70 px-2 py-1 text-sm',
            className,
          )}
        >
          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{children}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent>{message}</TooltipContent>
    </Tooltip>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}

const splitComma = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const splitNewline = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function CvEditor({ value, saving, canMutate, onSave, onExport, exporting }: CvEditorProps) {
  const readOnly = !canMutate;

  const [headline, setHeadline] = React.useState(value.headline ?? '');
  const [summary, setSummary] = React.useState(value.summary);
  const [skills, setSkills] = React.useState(
    value.skills.map((cat) => ({ category: cat.category, items: cat.items.join(', ') })),
  );
  const [roles, setRoles] = React.useState(
    value.experience.map((role) => ({
      location: role.location ?? '',
      bullets: role.bullets.join('\n'),
    })),
  );
  const [education, setEducation] = React.useState(
    value.education.map((edu) => ({ institution: edu.institution ?? '', year: edu.year ?? '' })),
  );
  const [certs, setCerts] = React.useState(
    value.certifications.map((cert) => ({ issuer: cert.issuer ?? '', year: cert.year ?? '' })),
  );
  const [projects, setProjects] = React.useState(
    value.projects.map((project) => ({
      name: project.name,
      description: project.description ?? '',
      technologies: project.technologies.join(', '),
    })),
  );

  const buildContent = (): GeneratedCv => ({
    ...value,
    headline: headline.trim() ? headline.trim() : null,
    summary: summary.trim(),
    skills: skills
      .map((cat) => ({ category: cat.category.trim() || 'Other', items: splitComma(cat.items) }))
      .filter((cat) => cat.items.length > 0),
    experience: value.experience.map((role, i) => ({
      ...role,
      location: roles[i] ? roles[i].location.trim() || null : role.location,
      bullets: roles[i] ? splitNewline(roles[i].bullets) : role.bullets,
    })),
    education: value.education.map((edu, i) => ({
      ...edu,
      institution: education[i] ? education[i].institution.trim() || null : edu.institution,
      year: education[i] ? education[i].year.trim() || null : edu.year,
    })),
    certifications: value.certifications.map((cert, i) => ({
      ...cert,
      issuer: certs[i] ? certs[i].issuer.trim() || null : cert.issuer,
      year: certs[i] ? certs[i].year.trim() || null : cert.year,
    })),
    projects: projects.map((project) => ({
      name: project.name.trim() || 'Project',
      description: project.description.trim() || null,
      technologies: splitComma(project.technologies),
    })),
  });

  const contact = [value.contact.email, value.contact.phone, value.contact.location]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-5">
      {/* Actions */}
      {canMutate && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => onSave(buildContent())} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="animate-spin" /> Re-scoring…
              </>
            ) : (
              <>
                <Save /> Save &amp; Re-score
              </>
            )}
          </Button>
          <Button variant="outline" onClick={() => onExport('docx')} disabled={exporting}>
            <Download /> Export DOCX
          </Button>
          <Button variant="outline" onClick={() => onExport('pdf')} disabled={exporting}>
            <Download /> Export PDF
          </Button>
        </div>
      )}

      {/* Identity */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <LockedFact message="Candidate identity is immutable — integrity guardrail">
            {value.fullName}
          </LockedFact>
          {contact && <span className="text-sm text-muted-foreground">{contact}</span>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cv-headline">Headline</Label>
          <Input
            id="cv-headline"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="One-line professional headline"
            disabled={readOnly}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-1.5">
        <Label htmlFor="cv-summary">Summary</Label>
        <Textarea
          id="cv-summary"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          rows={4}
          disabled={readOnly}
        />
      </div>

      <Separator />

      {/* Skills */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Skills</SectionTitle>
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSkills((cur) => [...cur, { category: '', items: '' }])}
            >
              <Plus /> Add category
            </Button>
          )}
        </div>
        {skills.length === 0 && <p className="text-sm text-muted-foreground">No skill categories.</p>}
        {skills.map((cat, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Input
                value={cat.category}
                onChange={(e) =>
                  setSkills((cur) => cur.map((c, j) => (j === i ? { ...c, category: e.target.value } : c)))
                }
                placeholder="Category, e.g. Cloud & DevOps"
                className="h-8"
                disabled={readOnly}
              />
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setSkills((cur) => cur.filter((_, j) => j !== i))}
                  aria-label="Remove category"
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <Textarea
              value={cat.items}
              onChange={(e) =>
                setSkills((cur) => cur.map((c, j) => (j === i ? { ...c, items: e.target.value } : c)))
              }
              rows={2}
              placeholder="Comma-separated skills, e.g. AWS, Terraform, Docker"
              disabled={readOnly}
            />
          </div>
        ))}
      </div>

      <Separator />

      {/* Experience */}
      <div className="space-y-3">
        <SectionTitle>Experience</SectionTitle>
        {value.experience.map((role, i) => (
          <div key={i} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <LockedFact className="font-medium">
                {role.title} — {role.employer}
              </LockedFact>
              <LockedFact>
                {role.startDate ?? '?'} – {role.endDate ?? 'Present'}
              </LockedFact>
            </div>
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                value={roles[i]?.location ?? ''}
                onChange={(e) =>
                  setRoles((cur) => cur.map((r, j) => (j === i ? { ...r, location: e.target.value } : r)))
                }
                placeholder="e.g. Pune, India"
                className="h-8"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bullets (one per line)</Label>
              <Textarea
                value={roles[i]?.bullets ?? ''}
                onChange={(e) =>
                  setRoles((cur) => cur.map((r, j) => (j === i ? { ...r, bullets: e.target.value } : r)))
                }
                rows={Math.min(10, Math.max(3, role.bullets.length + 1))}
                disabled={readOnly}
              />
            </div>
          </div>
        ))}
        {value.experience.length === 0 && (
          <p className="text-sm text-muted-foreground">No experience entries.</p>
        )}
      </div>

      <Separator />

      {/* Education */}
      <div className="space-y-3">
        <SectionTitle>Education</SectionTitle>
        {value.education.length === 0 && (
          <p className="text-sm text-muted-foreground">No education entries.</p>
        )}
        {value.education.map((edu, i) => (
          <div key={i} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_8rem]">
            <div className="min-w-0">
              <LockedFact message="Degree and certification names are immutable — integrity guardrail">
                {edu.degree}
              </LockedFact>
            </div>
            <div className="space-y-1.5">
              <Label>Institution</Label>
              <Input
                value={education[i]?.institution ?? ''}
                onChange={(e) =>
                  setEducation((cur) =>
                    cur.map((x, j) => (j === i ? { ...x, institution: e.target.value } : x)),
                  )
                }
                className="h-8"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input
                value={education[i]?.year ?? ''}
                onChange={(e) =>
                  setEducation((cur) => cur.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))
                }
                className="h-8"
                disabled={readOnly}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Certifications */}
      <div className="space-y-3">
        <SectionTitle>Certifications</SectionTitle>
        {value.certifications.length === 0 && (
          <p className="text-sm text-muted-foreground">No certifications.</p>
        )}
        {value.certifications.map((cert, i) => (
          <div key={i} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-[1fr_1fr_8rem]">
            <div className="min-w-0">
              <LockedFact message="Degree and certification names are immutable — integrity guardrail">
                {cert.name}
              </LockedFact>
            </div>
            <div className="space-y-1.5">
              <Label>Issuer</Label>
              <Input
                value={certs[i]?.issuer ?? ''}
                onChange={(e) =>
                  setCerts((cur) => cur.map((x, j) => (j === i ? { ...x, issuer: e.target.value } : x)))
                }
                className="h-8"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Year</Label>
              <Input
                value={certs[i]?.year ?? ''}
                onChange={(e) =>
                  setCerts((cur) => cur.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))
                }
                className="h-8"
                disabled={readOnly}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Projects */}
      <div className="space-y-3">
        <SectionTitle>Projects</SectionTitle>
        {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects.</p>}
        {projects.map((project, i) => (
          <div key={i} className="space-y-2 rounded-md border p-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={project.name}
                onChange={(e) =>
                  setProjects((cur) => cur.map((p, j) => (j === i ? { ...p, name: e.target.value } : p)))
                }
                className="h-8"
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={project.description}
                onChange={(e) =>
                  setProjects((cur) =>
                    cur.map((p, j) => (j === i ? { ...p, description: e.target.value } : p)),
                  )
                }
                rows={2}
                disabled={readOnly}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Technologies (comma-separated)</Label>
              <Input
                value={project.technologies}
                onChange={(e) =>
                  setProjects((cur) =>
                    cur.map((p, j) => (j === i ? { ...p, technologies: e.target.value } : p)),
                  )
                }
                className="h-8"
                disabled={readOnly}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
