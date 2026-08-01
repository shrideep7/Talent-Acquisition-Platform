'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileSearch } from 'lucide-react';
import type { JdDto } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn, formatDateTime, scoreColor } from '@/lib/utils';

/**
 * Summary rows returned by GET /analyses (list endpoint).
 * Verified against apps/api/src/analyses/analyses.service.ts (MatchAnalysisSummaryDto).
 */
interface AnalysisSummary {
  id: string;
  jdId: string;
  candidateId: string;
  cvDocumentId: string | null;
  cvVersionId: string | null;
  totalScore: number;
  createdAt: string;
}

export function MatchHistoryCard({ candidateId }: { candidateId: string }) {
  const analysesQuery = useQuery({
    queryKey: ['analyses', 'candidate', candidateId],
    queryFn: () => api.get<AnalysisSummary[]>(`/analyses?candidateId=${candidateId}`),
  });
  const jdsQuery = useQuery({
    queryKey: ['jds', ''],
    queryFn: () => api.get<JdDto[]>('/jds'),
  });

  const analyses = analysesQuery.data ?? [];
  const jdTitles = new Map((jdsQuery.data ?? []).map((jd) => [jd.id, jd.title]));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Match History</CardTitle>
      </CardHeader>
      <CardContent>
        {analysesQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : analyses.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
            <FileSearch className="h-7 w-7" />
            <p className="text-sm">No match analyses yet for this candidate.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {analyses.map((analysis) => (
              <li key={analysis.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {jdTitles.get(analysis.jdId) ?? 'Unknown JD'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(analysis.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn('tabular-nums', scoreColor(analysis.totalScore))}
                  >
                    {analysis.totalScore}
                  </Badge>
                  <Button asChild variant="ghost" size="sm">
                    <Link
                      href={`/analyzer?jdId=${analysis.jdId}&candidateId=${analysis.candidateId}${
                        analysis.cvDocumentId ? `&cvDocumentId=${analysis.cvDocumentId}` : ''
                      }&analysisId=${analysis.id}`}
                    >
                      <ExternalLink className="mr-1 h-3.5 w-3.5" />
                      Open in Analyzer
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
