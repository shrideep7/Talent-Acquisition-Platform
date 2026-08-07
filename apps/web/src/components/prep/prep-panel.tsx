'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  GraduationCap,
  Hammer,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  PhoneCall,
  RefreshCw,
  Scale,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  HrScreeningCall,
  InterviewPrep,
  InterviewPrepDto,
  SkillVerificationChecklist,
  UpskillingPlan,
} from '@mfd/shared';

import {
  hrCallHtml,
  likelyQuestionsHtml,
  openPrintWindow,
  screeningHtml,
  upskillingHtml,
  type SkillsSnapshot,
} from '@/components/prep/print-section';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { cn, formatDateTime } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Styling maps
// ---------------------------------------------------------------------------

type QuestionCategory = InterviewPrep['likelyQuestions'][number]['category'];

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  technical: 'Technical',
  project_deep_dive: 'Project deep dive',
  behavioral: 'Behavioral',
  domain: 'Domain',
  scenario: 'Scenario',
};

const CATEGORY_STYLES: Record<QuestionCategory, string> = {
  technical: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  project_deep_dive:
    'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  behavioral:
    'border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
  domain:
    'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  scenario: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

/** Opens the browser print dialog on a window containing only this section. */
function SectionDownload({
  title,
  buildHtml,
}: {
  title: string;
  buildHtml: () => string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        if (!openPrintWindow(title, buildHtml())) {
          toast.error('Allow pop-ups for this site to download the section');
        }
      }}
    >
      <Download className="mr-1.5 h-3.5 w-3.5" />
      Download
    </Button>
  );
}

type ScreeningArea = HrScreeningCall['questions'][number]['area'];

const AREA_LABELS: Record<ScreeningArea, string> = {
  experience: 'Experience',
  skills: 'Skills',
  projects: 'Projects',
  education: 'Education',
  logistics: 'Logistics',
};

const AREA_STYLES: Record<ScreeningArea, string> = {
  experience: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  skills: 'border-transparent bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  projects:
    'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  education: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  logistics: 'border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};

function prepErrorToast(err: unknown, fallback: string) {
  if (err instanceof ApiError && err.status === 422) {
    toast.error('Run a match analysis first', {
      description: 'The prep pack is built from the latest match analysis for this JD and candidate.',
    });
    return;
  }
  toast.error(err instanceof Error ? err.message : fallback);
}

// ---------------------------------------------------------------------------
// PrepPanel — EXACT export contract, imported by the Analyzer as
// import { PrepPanel } from '@/components/prep/prep-panel';
// ---------------------------------------------------------------------------

export function PrepPanel({
  jdId,
  candidateId,
  skills,
}: {
  jdId: string;
  candidateId: string;
  /** Matched/partial/missing skills from the latest analysis — included in the upskilling download. */
  skills?: SkillsSnapshot;
}): JSX.Element {
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';
  const queryClient = useQueryClient();

  const prepsQuery = useQuery({
    queryKey: ['interview-preps', jdId, candidateId],
    queryFn: () =>
      api.get<InterviewPrepDto[]>(`/interview-preps?jdId=${jdId}&candidateId=${candidateId}`),
  });
  // API returns latest first.
  const latest = prepsQuery.data?.[0] ?? null;

  const generate = useMutation({
    mutationFn: () => api.post<InterviewPrepDto>('/interview-preps', { jdId, candidateId }),
    onSuccess: () => {
      toast.success('Interview prep pack generated');
      queryClient.invalidateQueries({ queryKey: ['interview-preps', jdId, candidateId] });
    },
    onError: (err) => prepErrorToast(err, 'Failed to generate the prep pack'),
  });

  if (prepsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!latest) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interview Prep Pack</CardTitle>
          <CardDescription>
            Generates three briefings from the latest match analysis: an HR screening-call deck to
            verify the candidate is genuine on the first call, the questions the client is likely
            to ask, and genuineness-screening questions for MFD&apos;s internal interview — plus the
            Upskilling Plan tab for closing skill gaps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {generate.isPending ? (
            <GeneratingHint />
          ) : isViewer ? (
            <p className="text-sm text-muted-foreground">
              No prep pack has been generated yet. Ask a recruiter to generate one.
            </p>
          ) : (
            <Button onClick={() => generate.mutate()}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Interview Prep Pack
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const prep = latest.prep;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Prep pack generated {formatDateTime(latest.createdAt)} — each section has its own
          Download button.
        </p>
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

      {generate.isPending && <GeneratingHint />}

      <Tabs defaultValue="hr-call">
        <TabsList>
          <TabsTrigger value="hr-call">HR Screening Call</TabsTrigger>
          <TabsTrigger value="questions">Likely Client Questions</TabsTrigger>
          <TabsTrigger value="screening">Genuineness Screening</TabsTrigger>
          <TabsTrigger value="upskilling">Upskilling Plan</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ Upskilling plan */}
        <TabsContent value="upskilling" className="space-y-3">
          <UpskillingPlanSection
            jdId={jdId}
            candidateId={candidateId}
            isViewer={isViewer}
            skills={skills}
          />
        </TabsContent>

        {/* ------------------------------------------------ HR screening call */}
        <TabsContent value="hr-call" className="space-y-3">
          <HrScreeningCallDeck call={prep.hrScreeningCall} />
        </TabsContent>

        {/* ------------------------------------------------ Likely questions */}
        <TabsContent value="questions" className="space-y-3">
          {prep.likelyQuestions.length > 0 && (
            <div className="flex justify-end">
              <SectionDownload
                title="Likely Client Questions"
                buildHtml={() => likelyQuestionsHtml(prep.likelyQuestions)}
              />
            </div>
          )}
          {prep.likelyQuestions.length === 0 ? (
            <EmptyNote text="No likely questions were generated." />
          ) : (
            prep.likelyQuestions.map((q, i) => (
              <Card key={i}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-snug">{q.question}</p>
                    <Badge className={cn('shrink-0 shadow-none', CATEGORY_STYLES[q.category])}>
                      {CATEGORY_LABELS[q.category]}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Why: {q.basis}</p>
                  {q.prepPoints.length > 0 && (
                    <ul className="space-y-1.5 pt-1">
                      {q.prepPoints.map((point, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ------------------------------------------------ Genuineness screening */}
        <TabsContent value="screening" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Ask these in MFD&apos;s internal interview to verify the CV is authentic.
            </p>
            {prep.screeningQuestions.length > 0 && (
              <SectionDownload
                title="Genuineness Screening Questions"
                buildHtml={() => screeningHtml(prep.screeningQuestions)}
              />
            )}
          </div>
          {prep.screeningQuestions.length === 0 ? (
            <EmptyNote text="No screening questions were generated." />
          ) : (
            prep.screeningQuestions.map((q, i) => (
              <Card key={i}>
                <CardContent className="space-y-3 pt-5">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold leading-snug">{q.question}</p>
                    <p className="text-sm text-muted-foreground">{q.purpose}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Listen for
                      </p>
                      <ul className="space-y-1">
                        {q.listenFor.map((item, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium uppercase tracking-wide text-red-700 dark:text-red-400">
                        Red flags
                      </p>
                      <ul className="space-y-1">
                        {q.redFlags.map((item, j) => (
                          <li key={j} className="flex items-start gap-2 text-sm">
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <VerificationChecklistSection jdId={jdId} candidateId={candidateId} isViewer={isViewer} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HR screening call deck — the first telephonic call, run by non-technical HR
// ---------------------------------------------------------------------------

function HrScreeningCallDeck({ call }: { call: HrScreeningCall | undefined }) {
  // Packs generated before this deck existed lack the section.
  if (!call) {
    return (
      <EmptyNote text="This prep pack was generated before the HR screening-call deck existed — click Regenerate to add it." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          For the first telephonic screening — verifies the CV&apos;s experience, skills and
          projects with questions a non-technical recruiter can ask and judge.
        </p>
        <SectionDownload title="HR Screening Call" buildHtml={() => hrCallHtml(call)} />
      </div>

      {/* Opening script */}
      {call.callOpening.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
              Opening the call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {call.callOpening.map((line, i) => (
                <li key={i} className="text-sm italic text-muted-foreground">
                  &ldquo;{line}&rdquo;
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Verification questions, in call order */}
      {call.questions.length === 0 ? (
        <EmptyNote text="No screening-call questions were generated." />
      ) : (
        call.questions.map((q, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-5">
              <div className="space-y-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">
                    {i + 1}. {q.question}
                  </p>
                  <Badge className={cn('shrink-0 shadow-none', AREA_STYLES[q.area])}>
                    {AREA_LABELS[q.area]}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">Checks: {q.claim}</p>
              </div>
              <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                <span className="font-medium">A genuine answer sounds like: </span>
                {q.genuineAnswer}
              </div>
              {q.redFlags.length > 0 && (
                <ul className="space-y-1">
                  {q.redFlags.map((flag, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              )}
              {q.followUp && (
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    If vague, ask: <span className="italic">&ldquo;{q.followUp}&rdquo;</span>
                  </span>
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Logistics to confirm before closing */}
        {call.logisticsChecklist.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                Before closing — confirm
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {call.logisticsChecklist.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* How to judge the call */}
        {call.verdictGuidance.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Scale className="h-4 w-4 text-muted-foreground" />
                After the call — how to judge
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1.5">
                {call.verdictGuidance.map((rule, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upskilling plan — honest learning path for genuinely missing skills
// ---------------------------------------------------------------------------

const PRIORITY_STYLES: Record<string, string> = {
  critical: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  important: 'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  nice_to_have:
    'border-transparent bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300',
};

function UpskillingPlanSection({
  jdId,
  candidateId,
  isViewer,
  skills,
}: {
  jdId: string;
  candidateId: string;
  isViewer: boolean;
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
    onError: (err) => prepErrorToast(err, 'Failed to generate the upskilling plan'),
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
          <GeneratingHint />
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
          <SectionDownload
            title="Upskilling Plan"
            buildHtml={() => upskillingHtml(plan, skills)}
          />
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
        <EmptyNote text="No missing skills in the latest analysis." />
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

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function GeneratingHint() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Generating the prep pack from the latest match analysis — this usually takes about a
        minute…
      </p>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      {text}
    </p>
  );
}

function VerificationChecklistSection({
  jdId,
  candidateId,
  isViewer,
}: {
  jdId: string;
  candidateId: string;
  isViewer: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [checklist, setChecklist] = React.useState<SkillVerificationChecklist | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      api.post<SkillVerificationChecklist>('/interview-preps/verification-checklist', {
        jdId,
        candidateId,
      }),
    onSuccess: (result) => {
      setChecklist(result);
      toast.success(
        result.items.length === 0
          ? 'No unverified-possible skills to check'
          : `Checklist generated for ${result.items.length} skill${result.items.length === 1 ? '' : 's'}`,
      );
    },
    onError: (err) => prepErrorToast(err, 'Failed to generate the checklist'),
  });

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          Skill Verification Checklist
        </span>
        <span className="text-xs text-muted-foreground">
          For Tier-3 (unverified-possible) skills from the latest analysis
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t p-4">
          {checklist === null ? (
            generate.isPending ? (
              <GeneratingHint />
            ) : isViewer ? (
              <p className="text-sm text-muted-foreground">
                Checklist generation requires a recruiter or admin role.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Builds verification questions for skills the candidate plausibly has but the CV
                  does not evidence. If the candidate demonstrates a skill, record the evidence in
                  the Skill Verification board so it can enter generated CVs.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generate.mutate()}
                 
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Generate checklist for unverified skills
                </Button>
              </div>
            )
          ) : checklist.items.length === 0 ? (
            <EmptyNote text="No unverified-possible skills in the latest analysis" />
          ) : (
            <>
              {checklist.items.map((item, i) => (
                <Card key={i}>
                  <CardContent className="space-y-3 pt-5">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold">{item.skill}</p>
                      <p className="text-sm text-muted-foreground">{item.whyPlausible}</p>
                    </div>
                    <ol className="list-decimal space-y-1 pl-5 text-sm">
                      {item.verificationQuestions.map((question, j) => (
                        <li key={j}>{question}</li>
                      ))}
                    </ol>
                    <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                      <span className="font-medium">Evidence to record: </span>
                      {item.evidenceToRecord}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!isViewer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => generate.mutate()}
                  disabled={generate.isPending}
                 
                >
                  {generate.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Regenerate checklist
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
