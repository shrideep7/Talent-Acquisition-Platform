'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Briefcase,
  FileSearch,
  FolderUp,
  Gauge,
  LineChart,
  UserPlus,
  Users,
} from 'lucide-react';
import type { CandidateDto, JdDto } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { cn, formatDate, scoreColor } from '@/lib/utils';

/** Shape of GET /analyses list items (verified against apps/api/src/analyses/analyses.service.ts list()). */
interface MatchAnalysisSummary {
  id: string;
  jdId: string;
  candidateId: string;
  cvDocumentId: string | null;
  cvVersionId: string | null;
  totalScore: number;
  createdAt: string;
}

function StatCard({
  label,
  value,
  icon: Icon,
  valueClass,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  valueClass?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-14" />
          ) : (
            <p className={cn('text-2xl font-semibold tracking-tight', valueClass)}>{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name?.split(/\s+/)[0] ?? 'there';

  const jdsQuery = useQuery({
    queryKey: ['jds', ''],
    queryFn: () => api.get<JdDto[]>('/jds'),
  });
  const candidatesQuery = useQuery({
    queryKey: ['candidates', ''],
    queryFn: () => api.get<CandidateDto[]>('/candidates'),
  });
  const analysesQuery = useQuery({
    queryKey: ['analyses', 'all'],
    queryFn: () => api.get<MatchAnalysisSummary[]>('/analyses'),
  });

  const jds = jdsQuery.data ?? [];
  const candidates = candidatesQuery.data ?? [];
  const analyses = analysesQuery.data ?? [];

  const avgScore =
    analyses.length > 0
      ? Math.round(analyses.reduce((sum, a) => sum + a.totalScore, 0) / analyses.length)
      : null;

  const candidateNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of candidates) map.set(c.id, c.fullName);
    return map;
  }, [candidates]);

  const jdTitleById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const jd of jds) map.set(jd.id, jd.title);
    return map;
  }, [jds]);

  const recentJds = jds.slice(0, 5);
  const recentAnalyses = analyses.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Header + quick actions */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back, {firstName}</h1>
          <p className="text-muted-foreground">
            Here is what is happening across your requisitions today.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/analyzer">
              <FileSearch className="mr-2 h-4 w-4" />
              New Analysis
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sourcing">
              <FolderUp className="mr-2 h-4 w-4" />
              Bulk Upload
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/candidates">
              <UserPlus className="mr-2 h-4 w-4" />
              Add Candidate
            </Link>
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Active JDs"
          value={jds.length}
          icon={Briefcase}
          loading={jdsQuery.isLoading}
        />
        <StatCard
          label="Candidates"
          value={candidates.length}
          icon={Users}
          loading={candidatesQuery.isLoading}
        />
        <StatCard
          label="Analyses run"
          value={analyses.length}
          icon={LineChart}
          loading={analysesQuery.isLoading}
        />
        <StatCard
          label="Avg match score"
          value={avgScore === null ? '—' : avgScore}
          valueClass={avgScore === null ? undefined : scoreColor(avgScore)}
          icon={Gauge}
          loading={analysesQuery.isLoading}
        />
      </div>

      {/* Two-column grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent JDs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <CardTitle className="text-base">Recent Job Descriptions</CardTitle>
              <CardDescription>Latest requisitions added to the platform</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/jds">
                View all
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {jdsQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentJds.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No job descriptions yet.{' '}
                <Link href="/jds" className="font-medium text-primary hover:underline">
                  Add your first JD
                </Link>
              </div>
            ) : (
              <ul className="divide-y">
                {recentJds.map((jd) => (
                  <li key={jd.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Link
                        href={`/jds/${jd.id}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {jd.title}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
                        {jd.clientName} · {formatDate(jd.createdAt)}
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <Link href={`/analyzer?jdId=${jd.id}`}>Analyze</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent analyses */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Recent Analyses</CardTitle>
            <CardDescription>Latest JD–CV match runs</CardDescription>
          </CardHeader>
          <CardContent>
            {analysesQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : recentAnalyses.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No analyses yet.{' '}
                <Link href="/analyzer" className="font-medium text-primary hover:underline">
                  Run your first analysis
                </Link>
              </div>
            ) : (
              <ul className="divide-y">
                {recentAnalyses.map((a) => {
                  const candidateName =
                    candidateNameById.get(a.candidateId) ?? a.candidateId.slice(0, 8);
                  const jdTitle = jdTitleById.get(a.jdId);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{candidateName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {jdTitle ? `${jdTitle} · ` : ''}
                          {formatDate(a.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn('tabular-nums', scoreColor(a.totalScore))}
                        >
                          {a.totalScore}
                        </Badge>
                        {a.cvDocumentId && (
                          <Button asChild variant="ghost" size="sm">
                            <Link
                              href={`/analyzer?jdId=${a.jdId}&candidateId=${a.candidateId}&cvDocumentId=${a.cvDocumentId}`}
                            >
                              Open
                            </Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
