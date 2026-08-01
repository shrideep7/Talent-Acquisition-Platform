'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CvChange, CvVersionDto, GeneratedCv, MatchAnalysisDto, MatchBreakdown } from '@mfd/shared';
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { CvEditor } from '@/components/analyzer/cv-editor';
import { DiffView } from '@/components/analyzer/diff-view';
import { ScoreDial } from '@/components/score-dial';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { cn, scoreColor } from '@/lib/utils';

// Response shapes verified against apps/api/src/cv-versions/cv-versions.service.ts
export interface GenerateCvVersionResponse {
  version: CvVersionDto;
  beforeScore: number;
  afterScore: number;
  beforeBreakdown: MatchBreakdown;
  afterBreakdown: MatchBreakdown;
}

interface UpdateCvVersionResponse {
  version: CvVersionDto;
  breakdown: MatchBreakdown;
}

export interface GenerationMeta {
  beforeScore: number;
  afterScore: number;
  beforeBreakdown: MatchBreakdown;
  afterBreakdown: MatchBreakdown;
}

export interface OptimizeTabProps {
  jdId: string;
  candidateId: string;
  cvDocumentId: string;
  analysis: MatchAnalysisDto;
  originalCvText: string | undefined;
  activeVersion: CvVersionDto | null;
  genMeta: GenerationMeta | null;
  onGenerated: (result: GenerateCvVersionResponse) => void;
  onVersionUpdated: (version: CvVersionDto, breakdown: MatchBreakdown) => void;
  canMutate: boolean;
}

const GENERATION_HINTS = [
  'Extracting truthful evidence from the source CV…',
  'Mirroring JD terminology where the CV supports it…',
  'Restructuring sections for ATS readability…',
  'Rephrasing bullets — no facts invented…',
  'Routing unevidenced skills to the interview briefing…',
  'Re-scoring the optimized CV against the JD…',
];

const CHANGE_TYPE_CLASSES: Record<CvChange['changeType'], string> = {
  rephrase: 'border-transparent bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200',
  terminology:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  reorder:
    'border-transparent bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200',
  quantify: 'border-transparent bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200',
  format: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-700/60 dark:text-slate-200',
  skill_promotion:
    'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  condense: 'border-transparent bg-pink-100 text-pink-900 dark:bg-pink-900/40 dark:text-pink-200',
};

const TIER_CLASSES: Record<string, string> = {
  EXPLICIT:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  TERMINOLOGY:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  INFERRED:
    'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  UNVERIFIED_POSSIBLE:
    'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  ABSENT: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

function defaultTarget(analysis: MatchAnalysisDto): number {
  return Math.min(95, Math.max(85, Math.round(analysis.totalScore) + 15));
}

function GenerationProgress() {
  const [hintIndex, setHintIndex] = React.useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => setHintIndex((i) => (i + 1) % GENERATION_HINTS.length), 3500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-2">
      <style>{`@keyframes mfd-analyzer-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
      <div className="h-2 w-full overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full w-1/3 rounded-full bg-primary/60"
          style={{ animation: 'mfd-analyzer-shimmer 1.2s ease-in-out infinite' }}
        />
      </div>
      <p className="animate-pulse text-sm text-muted-foreground">
        Generating (takes 1–2 minutes) — {GENERATION_HINTS[hintIndex]}
      </p>
    </div>
  );
}

export function OptimizeTab({
  jdId,
  candidateId,
  cvDocumentId,
  analysis,
  originalCvText,
  activeVersion,
  genMeta,
  onGenerated,
  onVersionUpdated,
  canMutate,
}: OptimizeTabProps) {
  const queryClient = useQueryClient();
  const [targetScore, setTargetScore] = React.useState(() => defaultTarget(analysis));
  const [showDiff, setShowDiff] = React.useState(false);

  React.useEffect(() => {
    setTargetScore(defaultTarget(analysis));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.id]);

  const generate = useMutation({
    mutationFn: () =>
      api.post<GenerateCvVersionResponse>('/cv-versions', {
        jdId,
        candidateId,
        cvDocumentId,
        targetScore,
      }),
    onSuccess: (result) => {
      onGenerated(result);
      queryClient.invalidateQueries({ queryKey: ['cv-versions'] });
      toast.success(
        `CV v${result.version.versionNumber} generated — score ${Math.round(result.beforeScore)} → ${Math.round(result.afterScore)}`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const save = useMutation({
    mutationFn: (content: GeneratedCv) => {
      if (!activeVersion) throw new Error('No CV version loaded');
      return api.patch<UpdateCvVersionResponse>(`/cv-versions/${activeVersion.id}`, { content });
    },
    onSuccess: (result) => {
      onVersionUpdated(result.version, result.breakdown);
      queryClient.invalidateQueries({ queryKey: ['cv-versions'] });
      toast.success(
        `Saved & re-scored — new score ${Math.round(result.version.achievedScore ?? result.breakdown.totalScore)}`,
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const [exporting, setExporting] = React.useState(false);
  const handleExport = async (format: 'docx' | 'pdf') => {
    if (!activeVersion) return;
    setExporting(true);
    try {
      await api.download(
        `/cv-versions/${activeVersion.id}/export?format=${format}`,
        `cv-v${activeVersion.versionNumber}.${format}`,
      );
      queryClient.invalidateQueries({ queryKey: ['cv-versions'] });
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const delta = genMeta ? Math.round(genMeta.afterScore) - Math.round(genMeta.beforeScore) : 0;
  const targetHit =
    genMeta && activeVersion?.targetScore != null
      ? genMeta.afterScore >= activeVersion.targetScore
      : null;

  return (
    <div className="space-y-6">
      {/* Generate card */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            Generate ATS-Optimized CV
          </CardTitle>
          <CardDescription>
            The generator only rephrases, restructures and re-keywords truthful content. Skills the
            candidate does not have are never added — gaps go to the Interview Prep briefing
            instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="target-score">Target score</Label>
              <span className={cn('text-lg font-bold tabular-nums', scoreColor(targetScore))}>
                {targetScore}
              </span>
            </div>
            <Slider
              id="target-score"
              min={50}
              max={100}
              step={1}
              value={[targetScore]}
              onValueChange={([v]) => setTargetScore(v)}
              disabled={!canMutate || generate.isPending}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50</span>
              <span>Current: {Math.round(analysis.totalScore)}</span>
              <span>100</span>
            </div>
          </div>
          {generate.isPending ? (
            <GenerationProgress />
          ) : canMutate ? (
            <Button onClick={() => generate.mutate()}>
              <Sparkles /> Generate
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Viewers cannot generate CV versions — ask a recruiter or admin.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Before / After */}
      {genMeta && activeVersion && (
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Before / After</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10">
              <ScoreDial score={genMeta.beforeScore} label="Before" size={110} />
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    'flex items-center gap-1 text-3xl font-bold tabular-nums',
                    delta >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400',
                  )}
                >
                  {delta >= 0 ? <ArrowUp className="h-7 w-7" /> : <ArrowDown className="h-7 w-7" />}
                  {delta >= 0 ? `+${delta}` : delta}
                </span>
                {targetHit !== null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-normal',
                      targetHit
                        ? 'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : 'border-transparent bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
                    )}
                  >
                    {targetHit
                      ? `Target ${activeVersion.targetScore} hit`
                      : `Target ${activeVersion.targetScore} missed`}
                  </Badge>
                )}
              </div>
              <ScoreDial score={genMeta.afterScore} label="After" size={110} />
            </div>
            <div className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-md bg-muted/50 px-4 py-2 text-sm">
              <span className="text-muted-foreground">ATS health</span>
              <span className={cn('font-semibold tabular-nums', scoreColor(genMeta.beforeBreakdown.atsHealth.score))}>
                {Math.round(genMeta.beforeBreakdown.atsHealth.score)}
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <span className={cn('font-semibold tabular-nums', scoreColor(genMeta.afterBreakdown.atsHealth.score))}>
                {Math.round(genMeta.afterBreakdown.atsHealth.score)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Working version: changelog, diff, editor */}
      {activeVersion && (
        <>
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">What changed and why</CardTitle>
              <CardDescription>
                Version v{activeVersion.versionNumber}
                {activeVersion.achievedScore !== null && (
                  <>
                    {' '}
                    · achieved score{' '}
                    <span className={cn('font-semibold', scoreColor(activeVersion.achievedScore))}>
                      {Math.round(activeVersion.achievedScore)}
                    </span>
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeVersion.changeLog.length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Section</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="min-w-[16rem]">Change</TableHead>
                        <TableHead className="min-w-[12rem]">Why</TableHead>
                        <TableHead className="min-w-[12rem]">Evidence</TableHead>
                        <TableHead>Tier</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeVersion.changeLog.map((change, i) => (
                        <TableRow key={i}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {change.section}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn('font-normal', CHANGE_TYPE_CLASSES[change.changeType])}
                            >
                              {change.changeType.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[24rem]">
                            {change.before && (
                              <span className="block text-muted-foreground line-through decoration-muted-foreground/60">
                                {change.before}
                              </span>
                            )}
                            <span className="block">{change.after}</span>
                          </TableCell>
                          <TableCell className="max-w-[16rem] text-muted-foreground">
                            {change.reason}
                          </TableCell>
                          <TableCell className="max-w-[16rem] italic text-muted-foreground">
                            {change.evidence ? `“${change.evidence}”` : '—'}
                          </TableCell>
                          <TableCell>
                            {change.tier ? (
                              <Badge
                                variant="outline"
                                className={cn('font-normal', TIER_CLASSES[change.tier])}
                              >
                                {change.tier}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {activeVersion.integrityNotes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
                  <p className="mb-1.5 flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" /> Declined for integrity reasons
                  </p>
                  <ul className="list-disc space-y-1 pl-6 text-sm text-amber-800 dark:text-amber-300">
                    {activeVersion.integrityNotes.map((note, i) => (
                      <li key={i}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 border-t pt-4">
                <Switch id="diff-toggle" checked={showDiff} onCheckedChange={setShowDiff} />
                <Label htmlFor="diff-toggle" className="font-normal">
                  Full-text diff vs original CV
                </Label>
              </div>
              {showDiff &&
                (originalCvText ? (
                  <DiffView original={originalCvText} content={activeVersion.content} />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Original CV text is still loading — the diff will appear shortly.
                  </p>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-base">
                Edit CV — v{activeVersion.versionNumber}
              </CardTitle>
              <CardDescription>
                Employment facts, degree and certification names are locked — everything else is
                editable and re-scored on save.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CvEditor
                key={`${activeVersion.id}:${activeVersion.updatedAt}`}
                value={activeVersion.content}
                saving={save.isPending}
                canMutate={canMutate}
                onSave={(content) => save.mutate(content)}
                onExport={handleExport}
                exporting={exporting}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
