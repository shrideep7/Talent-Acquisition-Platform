'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import type { MatchBreakdown, VerifiedSkillDto } from '@mfd/shared';
import { CheckCircle2, ChevronDown, ListChecks, Loader2, Quote, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, scoreBgColor, scoreColor } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<string, string> = {
  EXPLICIT: 'Explicit',
  TERMINOLOGY: 'Terminology',
  INFERRED: 'Inferred',
  UNVERIFIED_POSSIBLE: 'Unverified',
  ABSENT: 'Absent',
};

const TIER_CLASSES: Record<string, string> = {
  EXPLICIT: 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  TERMINOLOGY: 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  INFERRED: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  UNVERIFIED_POSSIBLE: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  ABSENT: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

const CHIP_TONES = {
  green: 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  amber: 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  red: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
} as const;

function ChipGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: keyof typeof CHIP_TONES;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title} ({items.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground">None</span>
        ) : (
          items.map((item) => (
            <Badge key={item} variant="outline" className={cn('font-normal', CHIP_TONES[tone])}>
              {item}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  score,
  weight,
  defaultOpen = false,
  children,
}: {
  title: string;
  score: number;
  weight: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors hover:bg-accent/50"
      >
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">weight {weight}%</span>
        <Progress
          value={score}
          className="h-1.5 w-24 shrink-0 bg-muted"
          indicatorClassName={scoreBgColor(score)}
        />
        <span className={cn('w-8 shrink-0 text-right text-sm font-semibold tabular-nums', scoreColor(score))}>
          {Math.round(score)}
        </span>
      </button>
      {open && <div className="space-y-4 border-t px-4 py-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface BreakdownPanelProps {
  breakdown: MatchBreakdown;
  className?: string;
  /**
   * When set (and the viewer can mutate), missing skills get a
   * "Check with candidate" action that queues them on the verification
   * board — the honest path for a missing skill to enter a regenerated CV.
   */
  verify?: { candidateId: string; jdId: string };
}

/** Queues the missing skills as PROPOSED verification items. */
function VerifyMissingAction({
  missing,
  candidateId,
  jdId,
}: {
  missing: string[];
  candidateId: string;
  jdId: string;
}) {
  const [done, setDone] = React.useState(false);

  const propose = useMutation({
    mutationFn: () =>
      api.post<{ created: VerifiedSkillDto[]; skippedExisting: string[] }>(
        '/skills/propose-missing',
        { candidateId, jdId, skills: missing },
      ),
    onSuccess: (result) => {
      setDone(true);
      toast.success(
        result.created.length > 0
          ? `${result.created.length} skill${result.created.length === 1 ? '' : 's'} queued for verification`
          : 'All of these are already on the verification board',
        {
          description:
            'Ask about them in the screening call; mark the ones the candidate genuinely has as VERIFIED (with evidence) on the candidate page, then regenerate the CV.',
        },
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (missing.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2">
      <p className="min-w-0 flex-1 text-xs text-muted-foreground">
        Many CVs omit real skills. Queue the missing ones to check in the screening call — skills
        the candidate genuinely has get VERIFIED (with evidence) and enter the regenerated CV.
      </p>
      {done ? (
        <Button asChild size="sm" variant="outline">
          <Link href={`/candidates/${candidateId}`}>
            <ListChecks className="h-3.5 w-3.5" />
            Open verification board
          </Link>
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={propose.isPending}
          onClick={() => propose.mutate()}
        >
          {propose.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ListChecks className="h-3.5 w-3.5" />
          )}
          Check {missing.length} missing with candidate
        </Button>
      )}
    </div>
  );
}

export function BreakdownPanel({ breakdown, className, verify }: BreakdownPanelProps) {
  const { weights, skills, experience, keywords, education, atsHealth } = breakdown;

  const weightEntries: Array<[string, number]> = [
    ['Skills', weights.skills],
    ['Experience', weights.experience],
    ['Keywords', weights.keywords],
    ['Education', weights.education],
    ['ATS health', weights.atsHealth],
  ];

  return (
    <div className={cn('space-y-3', className)}>
      {/* Weights + overall impression */}
      <div className="space-y-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium uppercase tracking-wide">Weights</span>
          {weightEntries.map(([label, value]) => (
            <span key={label} className="tabular-nums">
              {label} <span className="font-semibold text-foreground">{value}%</span>
            </span>
          ))}
        </div>
        {breakdown.overallImpression && (
          <blockquote className="flex gap-2 rounded-md bg-muted/50 p-3 text-sm italic text-muted-foreground">
            <Quote className="h-4 w-4 shrink-0 opacity-60" />
            <span>{breakdown.overallImpression}</span>
          </blockquote>
        )}
      </div>

      {/* Skills */}
      <Section title="Skills match" score={skills.score} weight={weights.skills} defaultOpen>
        <div className="grid gap-4 sm:grid-cols-3">
          <ChipGroup title="Matched" items={skills.matched} tone="green" />
          <ChipGroup title="Partial" items={skills.partial} tone="amber" />
          <ChipGroup title="Missing" items={skills.missing} tone="red" />
        </div>
        {verify && (
          <VerifyMissingAction
            missing={skills.missing}
            candidateId={verify.candidateId}
            jdId={verify.jdId}
          />
        )}
        {skills.details.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>JD skill</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>CV term</TableHead>
                <TableHead>Evidence</TableHead>
                <TableHead>Rationale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.details.map((detail, i) => (
                <TableRow key={`${detail.jdSkill}-${i}`}>
                  <TableCell className="font-medium">
                    {detail.jdSkill}
                    {detail.importance === 'must_have' && (
                      <span className="ml-1 text-destructive" title="Must have">
                        *
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('font-normal', TIER_CLASSES[detail.tier])}>
                      {TIER_LABELS[detail.tier] ?? detail.tier}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{detail.cvTerm ?? '—'}</TableCell>
                  <TableCell className="max-w-[16rem] text-muted-foreground">
                    {detail.evidence ?? '—'}
                  </TableCell>
                  <TableCell className="max-w-[16rem] text-muted-foreground">
                    {detail.rationale}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      {/* Experience */}
      <Section title="Experience" score={experience.score} weight={weights.experience}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Candidate years" value={experience.candidateYears ?? '—'} />
          <Stat label="Relevant years" value={experience.relevantYears ?? '—'} />
          <Stat
            label="Required"
            value={
              experience.requiredMinYears === null && experience.requiredMaxYears === null
                ? '—'
                : `${experience.requiredMinYears ?? '?'}–${experience.requiredMaxYears ?? '?'} yrs`
            }
          />
          <Stat label="Domain match" value={`${Math.round(experience.domainMatch)}%`} />
          <Stat label="Role similarity" value={`${Math.round(experience.roleSimilarity)}%`} />
        </div>
        <p className="text-sm text-muted-foreground">{experience.rationale}</p>
      </Section>

      {/* Keywords */}
      <Section title="Keyword coverage" score={keywords.score} weight={weights.keywords}>
        <p className="text-sm">
          Coverage:{' '}
          <span className={cn('font-semibold tabular-nums', scoreColor(keywords.coveragePct))}>
            {Math.round(keywords.coveragePct)}%
          </span>
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <ChipGroup title="Exact matches" items={keywords.exactMatches} tone="green" />
          <ChipGroup
            title="Semantic matches"
            items={keywords.semanticMatches.map((m) => `${m.jdTerm} → ${m.cvTerm}`)}
            tone="amber"
          />
          <ChipGroup title="Missing" items={keywords.missing} tone="red" />
        </div>
      </Section>

      {/* Education */}
      <Section title="Education" score={education.score} weight={weights.education}>
        <div className="grid gap-4 sm:grid-cols-2">
          <ChipGroup title="Matched requirements" items={education.matchedRequirements} tone="green" />
          <ChipGroup title="Missing requirements" items={education.missingRequirements} tone="red" />
        </div>
        <p className="text-sm text-muted-foreground">{education.rationale}</p>
      </Section>

      {/* ATS health */}
      <Section title="ATS health" score={atsHealth.score} weight={weights.atsHealth}>
        <ul className="space-y-2">
          {atsHealth.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2">
              {check.passed ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <div className="min-w-0 space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{check.label}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-normal capitalize',
                      check.severity === 'critical' && CHIP_TONES.red,
                      check.severity === 'warning' && CHIP_TONES.amber,
                      check.severity === 'info' &&
                        'border-transparent bg-muted text-muted-foreground',
                    )}
                  >
                    {check.severity}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{check.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/50 p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
