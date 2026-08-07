'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CvVersionDto, JdDto, MatchAnalysisDto, MatchBreakdown } from '@mfd/shared';
import { Play } from 'lucide-react';
import { toast } from 'sonner';

import { CvInputCard } from '@/components/analyzer/cv-input-card';
import { JdInputCard } from '@/components/analyzer/jd-input-card';
import {
  OptimizeTab,
  type GenerateCvVersionResponse,
  type GenerationMeta,
} from '@/components/analyzer/optimize-tab';
import { SideBySideView } from '@/components/analyzer/side-by-side';
import { VersionHistoryTab } from '@/components/analyzer/version-history-tab';
import { BreakdownPanel } from '@/components/breakdown-panel';
import { PrepPanel } from '@/components/prep/prep-panel';
import { ScoreDial } from '@/components/score-dial';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';

interface CvTextResponse {
  text: string;
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Analyzer</h1>
      <p className="text-muted-foreground">
        Match a candidate CV against a job description, then optimize, prep and track versions.
      </p>
    </div>
  );
}

function AnalyzerSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeader />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function ShimmerBar({ label }: { label: string }) {
  return (
    <div className="w-full space-y-2">
      <style>{`@keyframes mfd-analyzer-run-shimmer { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
      <div className="h-2 w-full overflow-hidden rounded-full bg-primary/10">
        <div
          className="h-full w-1/3 rounded-full bg-primary/60"
          style={{ animation: 'mfd-analyzer-run-shimmer 1.2s ease-in-out infinite' }}
        />
      </div>
      <p className="animate-pulse text-center text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function AnalyzerContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const canMutate = user !== null && user.role !== 'VIEWER';

  // --- Selection state (URL-prefillable) ------------------------------------
  const [jdId, setJdId] = React.useState<string | null>(searchParams.get('jdId'));
  const [candidateId, setCandidateId] = React.useState<string | null>(
    searchParams.get('candidateId'),
  );
  const [cvDocumentId, setCvDocumentId] = React.useState<string | null>(
    searchParams.get('cvDocumentId'),
  );

  // --- Result state ----------------------------------------------------------
  const [analysis, setAnalysis] = React.useState<MatchAnalysisDto | null>(null);
  const [activeVersion, setActiveVersion] = React.useState<CvVersionDto | null>(null);
  const [genMeta, setGenMeta] = React.useState<GenerationMeta | null>(null);
  const [tab, setTab] = React.useState('optimize');

  const clearResults = React.useCallback(() => {
    setAnalysis(null);
    setActiveVersion(null);
    setGenMeta(null);
  }, []);

  const runAnalysis = useMutation({
    mutationFn: (vars: { jdId: string; cvDocumentId: string }) =>
      api.post<MatchAnalysisDto>('/analyses', vars),
    onSuccess: (result) => {
      setAnalysis(result);
      setActiveVersion(null);
      setGenMeta(null);
      setTab('optimize');
      toast.success(`Match analysis complete — score ${Math.round(result.totalScore)}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const runAnalysisMutate = runAnalysis.mutate;

  // Auto-run when all three URL params were provided.
  const autoRan = React.useRef(false);
  React.useEffect(() => {
    if (autoRan.current || user === null) return;
    const pJd = searchParams.get('jdId');
    const pCandidate = searchParams.get('candidateId');
    const pDoc = searchParams.get('cvDocumentId');
    if (!pJd || !pCandidate || !pDoc) return;
    autoRan.current = true;
    if (user.role !== 'VIEWER') {
      runAnalysisMutate({ jdId: pJd, cvDocumentId: pDoc });
    }
  }, [user, searchParams, runAnalysisMutate]);

  // --- Supporting data for the side-by-side view -----------------------------
  const { data: jdDetail, isLoading: jdLoading } = useQuery({
    queryKey: ['jd', jdId],
    queryFn: () => api.get<JdDto>(`/jds/${jdId}`),
    enabled: jdId !== null,
  });

  const { data: cvTextData, isLoading: cvTextLoading } = useQuery({
    queryKey: ['cv-text', candidateId, cvDocumentId],
    queryFn: () =>
      api.get<CvTextResponse>(`/candidates/${candidateId}/cv-documents/${cvDocumentId}/text`),
    enabled: candidateId !== null && cvDocumentId !== null,
  });

  // --- Handlers ---------------------------------------------------------------
  const handleSelectJd = (id: string) => {
    if (id === jdId) return;
    setJdId(id);
    clearResults();
  };

  const handleSelectCv = (nextCandidateId: string, nextDocId: string | null) => {
    if (nextCandidateId === candidateId && nextDocId === cvDocumentId) return;
    setCandidateId(nextCandidateId);
    setCvDocumentId(nextDocId);
    clearResults();
  };

  const handleLoadVersion = (version: CvVersionDto) => {
    setActiveVersion(version);
    setGenMeta(null);
    setTab('optimize');
    toast.success(`Loaded v${version.versionNumber} into the editor`);
  };

  const handleGenerated = (result: GenerateCvVersionResponse) => {
    setActiveVersion(result.version);
    setGenMeta({
      beforeScore: result.beforeScore,
      afterScore: result.afterScore,
      beforeBreakdown: result.beforeBreakdown,
      afterBreakdown: result.afterBreakdown,
    });
  };

  const handleVersionUpdated = (version: CvVersionDto, breakdown: MatchBreakdown) => {
    setActiveVersion(version);
    setGenMeta((cur) =>
      cur
        ? {
            ...cur,
            afterScore: breakdown.totalScore,
            afterBreakdown: breakdown,
          }
        : cur,
    );
  };

  const ready = jdId !== null && cvDocumentId !== null;
  const resultsCandidateId = analysis?.candidateId ?? candidateId;

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* SECTION 1 — Inputs */}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <JdInputCard jdId={jdId} onSelect={handleSelectJd} canMutate={canMutate} />
        <CvInputCard
          candidateId={candidateId}
          cvDocumentId={cvDocumentId}
          onSelect={handleSelectCv}
          canMutate={canMutate}
        />
      </div>

      {runAnalysis.isPending ? (
        <ShimmerBar label="Parsing & scoring…" />
      ) : (
        <div className="flex justify-center">
          {canMutate ? (
            <Button size="lg" disabled={!ready} onClick={() => runAnalysis.mutate({ jdId: jdId!, cvDocumentId: cvDocumentId! })}>
              <Play /> Run Match Analysis
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button size="lg" disabled>
                    <Play /> Run Match Analysis
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Viewers cannot run analyses — read-only role.</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}

      {/* SECTION 2 — Results */}
      {analysis === null && !runAnalysis.isPending && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Select a job description and a candidate CV, then run the match analysis. The score
            breakdown, side-by-side keyword view and CV optimizer will appear here.
          </CardContent>
        </Card>
      )}

      {analysis !== null && (
        <div className="space-y-6">
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <div className="flex w-64 shrink-0 justify-center pt-2">
              <ScoreDial score={analysis.totalScore} size={180} label="Overall match score" />
            </div>
            <div className="min-w-0 flex-1">
              <BreakdownPanel
                breakdown={analysis.breakdown}
                verify={
                  canMutate
                    ? { candidateId: analysis.candidateId, jdId: analysis.jdId }
                    : undefined
                }
              />
            </div>
          </div>

          <SideBySideView
            jdText={jdDetail?.rawText}
            jdLoading={jdLoading}
            cvText={cvTextData?.text}
            cvLoading={cvTextLoading}
            breakdown={analysis.breakdown}
          />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="optimize">Optimize CV</TabsTrigger>
              <TabsTrigger value="prep">Interview Prep</TabsTrigger>
              <TabsTrigger value="history">Version History</TabsTrigger>
            </TabsList>
            <TabsContent value="optimize" className="mt-4">
              {jdId && resultsCandidateId && cvDocumentId ? (
                <OptimizeTab
                  jdId={jdId}
                  candidateId={resultsCandidateId}
                  cvDocumentId={cvDocumentId}
                  analysis={analysis}
                  originalCvText={cvTextData?.text}
                  activeVersion={activeVersion}
                  genMeta={genMeta}
                  onGenerated={handleGenerated}
                  onVersionUpdated={handleVersionUpdated}
                  canMutate={canMutate}
                />
              ) : null}
            </TabsContent>
            <TabsContent value="prep" className="mt-4">
              {jdId && resultsCandidateId ? (
                <PrepPanel jdId={jdId} candidateId={resultsCandidateId} />
              ) : null}
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              {jdId && resultsCandidateId ? (
                <VersionHistoryTab
                  jdId={jdId}
                  candidateId={resultsCandidateId}
                  activeVersionId={activeVersion?.id ?? null}
                  onLoad={handleLoadVersion}
                  canMutate={canMutate}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

export default function AnalyzerPage() {
  return (
    <React.Suspense fallback={<AnalyzerSkeleton />}>
      <AnalyzerContent />
    </React.Suspense>
  );
}
