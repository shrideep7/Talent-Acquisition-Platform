'use client';

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Clock, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { SourcingJobDto, SourcingJobItemDto, SourcingJobStatus } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { cn, formatDateTime, scoreColor } from '@/lib/utils';

const STATUS_BADGE: Record<SourcingJobStatus, string> = {
  PENDING: 'border-transparent bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  RUNNING: 'border-transparent bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  COMPLETED:
    'border-transparent bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  FAILED: 'border-transparent bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
};

function isActive(status: SourcingJobStatus | undefined): boolean {
  return status === 'PENDING' || status === 'RUNNING';
}

function ItemStatusIcon({ item }: { item: SourcingJobItemDto }) {
  switch (item.status) {
    case 'PENDING':
      return <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />;
    case 'PROCESSING':
      return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />;
    case 'DONE':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />;
    case 'FAILED':
      return <XCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />;
  }
}

export interface JobProgressCardProps {
  jdId: string;
  activeJobId: string | null;
  onSelectJob: (jobId: string) => void;
}

/**
 * Polls the selected sourcing job every 2.5s while it is PENDING/RUNNING and
 * lists recent jobs for the JD. Invalidates the ranked list when a job finishes.
 */
export function JobProgressCard({ jdId, activeJobId, onSelectJob }: JobProgressCardProps) {
  const queryClient = useQueryClient();

  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['sourcing-jobs', jdId],
    queryFn: () => api.get<SourcingJobDto[]>(`/sourcing/jobs?jdId=${encodeURIComponent(jdId)}`),
  });

  const { data: job } = useQuery({
    queryKey: ['sourcing-job', activeJobId],
    queryFn: () => api.get<SourcingJobDto>(`/sourcing/jobs/${activeJobId}`),
    enabled: activeJobId !== null,
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 2500 : false),
  });

  const [itemsOpen, setItemsOpen] = React.useState(false);

  // Toast + refetch ranked list exactly once when a watched job finishes.
  const lastStatusRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!job) return;
    const key = `${job.id}:${job.status}`;
    const prev = lastStatusRef.current;
    lastStatusRef.current = key;
    if (!prev || !prev.startsWith(`${job.id}:`)) return;
    const prevStatus = prev.split(':')[1] as SourcingJobStatus;
    if (isActive(prevStatus) && !isActive(job.status)) {
      if (job.status === 'COMPLETED') {
        toast.success(`Bulk analysis complete — ${job.processedItems - job.failedItems} CV(s) scored`);
      } else {
        toast.error('Bulk analysis job failed');
      }
      void queryClient.invalidateQueries({ queryKey: ['sourcing-ranked', job.jdId] });
      void queryClient.invalidateQueries({ queryKey: ['sourcing-jobs', job.jdId] });
    }
  }, [job, queryClient]);

  if (jobsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Analysis Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if ((!jobs || jobs.length === 0) && !job) return null;

  const pct = job && job.totalItems > 0 ? (job.processedItems / job.totalItems) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Analysis Jobs</CardTitle>
        <CardDescription>Bulk-upload progress for this JD.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {job && (
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn('font-normal', STATUS_BADGE[job.status])}>
                {job.status}
              </Badge>
              <span className="text-sm tabular-nums text-muted-foreground">
                {job.processedItems}/{job.totalItems} processed
              </span>
              {job.failedItems > 0 && (
                <span className="text-sm font-medium tabular-nums text-red-600 dark:text-red-400">
                  {job.failedItems} failed
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDateTime(job.createdAt)}
              </span>
            </div>
            <Progress
              value={pct}
              className="h-2"
              indicatorClassName={job.status === 'FAILED' ? 'bg-red-500' : undefined}
            />
            {job.items && job.items.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setItemsOpen((v) => !v)}
                  aria-expanded={itemsOpen}
                  className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', itemsOpen && 'rotate-180')}
                  />
                  {itemsOpen ? 'Hide' : 'Show'} files ({job.items.length})
                </button>
                {itemsOpen && (
                  <ScrollArea className="mt-2 max-h-64 rounded-md border">
                    <ul className="divide-y">
                      {job.items.map((item) => (
                        <li key={item.id} className="flex items-start gap-2 px-3 py-2 text-sm">
                          <ItemStatusIcon item={item} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate">{item.fileName}</p>
                            {item.status === 'FAILED' && item.error && (
                              <p className="text-xs text-red-600 dark:text-red-400">{item.error}</p>
                            )}
                          </div>
                          {item.status === 'DONE' && item.totalScore !== null && (
                            <span
                              className={cn(
                                'shrink-0 text-sm font-semibold tabular-nums',
                                scoreColor(item.totalScore),
                              )}
                            >
                              {Math.round(item.totalScore)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        )}

        {jobs && jobs.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Recent jobs
            </p>
            <ul className="space-y-1">
              {jobs.slice(0, 5).map((j) => (
                <li key={j.id}>
                  <button
                    type="button"
                    onClick={() => onSelectJob(j.id)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent/50',
                      j.id === activeJobId && 'border-primary/40 bg-accent/50',
                    )}
                  >
                    <Badge variant="outline" className={cn('font-normal', STATUS_BADGE[j.status])}>
                      {j.status}
                    </Badge>
                    <span className="tabular-nums text-muted-foreground">
                      {j.processedItems}/{j.totalItems}
                    </span>
                    {j.failedItems > 0 && (
                      <span className="tabular-nums text-red-600 dark:text-red-400">
                        {j.failedItems} failed
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {formatDateTime(j.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
