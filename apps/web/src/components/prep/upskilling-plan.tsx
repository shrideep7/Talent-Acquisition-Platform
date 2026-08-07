'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import { Copy, Download, GraduationCap, Hammer, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { UpskillingPlan } from '@mfd/shared';

import { openPrintWindow, upskillingHtml, type SkillsSnapshot } from '@/components/prep/print-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  important: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  nice_to_have:
    'border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};

/**
 * Upskilling plan — honest learning path for skills the candidate genuinely
 * lacks. Standalone: needs only a match analysis, not an interview prep pack.
 */
export function UpskillingPlanSection({
  jdId,
  candidateId,
  isViewer,
  skills,
}: {
  jdId: string;
  candidateId: string;
  isViewer: boolean;
  /** Matched/partial/missing lists from the analysis — included in the download. */
  skills?: SkillsSnapshot;
}) {
  const [plan, setPlan] = React.useState<UpskillingPlan | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      api.post<UpskillingPlan>('/interview-preps/upskilling-plan', { jdId, candidateId }),
    onSuccess: (result) => {
      setPlan(result);
      toast.success(
        result.items.length === 0
          ? 'No missing skills — nothing to upskill'
          : `Upskilling plan ready — ${result.items.length} skill area${result.items.length === 1 ? '' : 's'}`,
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 422) {
        toast.error('Run a match analysis first', {
          description: 'The upskilling plan is built from the latest match analysis for this JD and candidate.',
        });
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Failed to generate the upskilling plan');
    },
  });

  const copyMessage = async () => {
    if (!plan?.candidateMessage) return;
    try {
      await navigator.clipboard.writeText(plan.candidateMessage);
      toast.success('Message copied — send it to the candidate');
    } catch {
      toast.error('Could not access the clipboard');
    }
  };

  const download = () => {
    if (!plan) return;
    if (!openPrintWindow('Upskilling Plan', upskillingHtml(plan, skills))) {
      toast.error('Allow pop-ups for this site to download the section');
    }
  };

  if (plan === null) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          For skills the candidate genuinely lacks: a realistic learning path (leveraging what they
          already know), a hands-on exercise per skill, and interview questions to practice — plus
          a ready-to-send message for the candidate. Skills enter the CV only through verification;
          this plan closes the gaps honestly.
        </p>
        {generate.isPending ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Generating the upskilling plan from the latest match analysis…
            </p>
          </div>
        ) : isViewer ? (
          <p className="text-sm text-muted-foreground">
            Plan generation requires a recruiter or admin role.
          </p>
        ) : (
          <Button onClick={() => generate.mutate()}>
            <GraduationCap className="mr-2 h-4 w-4" />
            Generate upskilling plan
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{plan.summary}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Download
          </Button>
          {!isViewer && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {plan.items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          No missing skills in the latest analysis.
        </p>
      ) : (
        plan.items.map((item, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">{item.skill}</p>
                <Badge className={cn('shadow-none', PRIORITY_STYLES[item.priority])}>
                  {item.priority.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className="font-normal">
                  learnable in {item.learnability}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{item.whyItMatters}</p>
              {item.leverageExisting && (
                <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                  <span className="font-medium">Head start: </span>
                  {item.leverageExisting}
                </p>
              )}
              {item.learningPath.length > 0 && (
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  {item.learningPath.map((step, j) => (
                    <li key={j}>{step}</li>
                  ))}
                </ol>
              )}
              <p className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm">
                <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  <span className="font-medium">Build this: </span>
                  {item.handsOnExercise}
                </span>
              </p>
              {item.interviewQuestions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Practice questions
                  </p>
                  {item.interviewQuestions.map((q, j) => (
                    <div key={j} className="space-y-0.5 text-sm">
                      <p className="font-medium">{q.question}</p>
                      <p className="text-muted-foreground">{q.guidance}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {plan.candidateMessage && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Message for the candidate</CardTitle>
            <Button variant="outline" size="sm" onClick={copyMessage}>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">
              {plan.candidateMessage}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
