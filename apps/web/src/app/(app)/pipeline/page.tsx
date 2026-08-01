'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ExternalLink, FileSearch, Loader2, MoreHorizontal, NotebookPen } from 'lucide-react';
import { toast } from 'sonner';
import { PIPELINE_STAGES, type PipelineEntryDto, type PipelineStage } from '@mfd/shared';

import { JdPicker } from '@/components/sourcing/jd-picker';
import { humanizeStage, STAGE_BADGE_CLASSES } from '@/components/sourcing/stages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { cn, formatDate, scoreColor } from '@/lib/utils';

function EntryCard({
  entry,
  jdId,
  isViewer,
  onMove,
  onEditNotes,
  moving,
}: {
  entry: PipelineEntryDto;
  jdId: string;
  isViewer: boolean;
  onMove: (entry: PipelineEntryDto, stage: PipelineStage) => void;
  onEditNotes: (entry: PipelineEntryDto) => void;
  moving: boolean;
}) {
  const otherStages = PIPELINE_STAGES.filter((stage) => stage !== entry.stage);

  return (
    <div className="space-y-1.5 rounded-md border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <Link
            href={`/candidates/${entry.candidateId}`}
            className="block truncate text-sm font-medium hover:underline"
          >
            {entry.candidate?.fullName ?? 'Unknown candidate'}
          </Link>
          {entry.candidate?.currentTitle && (
            <p className="truncate text-xs text-muted-foreground">{entry.candidate.currentTitle}</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" aria-label="Card menu">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {!isViewer && (
              <>
                <DropdownMenuLabel>Move to</DropdownMenuLabel>
                {otherStages.map((stage) => (
                  <DropdownMenuItem
                    key={stage}
                    disabled={moving}
                    onClick={() => onMove(entry, stage)}
                  >
                    <ArrowRight className="h-4 w-4" />
                    {humanizeStage(stage)}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onEditNotes(entry)}>
                  <NotebookPen className="h-4 w-4" />
                  Edit notes
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <Link href={`/candidates/${entry.candidateId}`}>
                <ExternalLink className="h-4 w-4" />
                Open candidate
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/analyzer?jdId=${jdId}&candidateId=${entry.candidateId}`}>
                <FileSearch className="h-4 w-4" />
                Open in Analyzer
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {entry.latestScore !== null && (
        <Badge
          variant="outline"
          className={cn('font-semibold tabular-nums', scoreColor(entry.latestScore))}
        >
          {Math.round(entry.latestScore)}
        </Badge>
      )}

      {entry.notes && (
        <p className="line-clamp-2 text-xs italic text-muted-foreground">{entry.notes}</p>
      )}

      <p className="text-[11px] text-muted-foreground">Updated {formatDate(entry.updatedAt)}</p>
    </div>
  );
}

function PipelineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const jdId = searchParams.get('jdId') ?? undefined;

  const [notesEntry, setNotesEntry] = React.useState<PipelineEntryDto | null>(null);
  const [notesText, setNotesText] = React.useState('');

  const { data: entries, isLoading } = useQuery({
    queryKey: ['pipeline', jdId],
    queryFn: () => api.get<PipelineEntryDto[]>(`/pipeline/jd/${jdId}`),
    enabled: jdId !== undefined,
  });

  const moveMutation = useMutation({
    mutationFn: ({ entry, stage }: { entry: PipelineEntryDto; stage: PipelineStage }) =>
      api.patch<PipelineEntryDto>(`/pipeline/${entry.id}`, { stage }),
    onSuccess: (_res, { stage }) => {
      toast.success(`Moved to ${humanizeStage(stage)}`);
      void queryClient.invalidateQueries({ queryKey: ['pipeline', jdId] });
      void queryClient.invalidateQueries({ queryKey: ['sourcing-ranked', jdId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not move candidate');
    },
  });

  const notesMutation = useMutation({
    mutationFn: ({ entryId, notes }: { entryId: string; notes: string }) =>
      api.patch<PipelineEntryDto>(`/pipeline/${entryId}`, { notes }),
    onSuccess: () => {
      toast.success('Notes saved');
      setNotesEntry(null);
      void queryClient.invalidateQueries({ queryKey: ['pipeline', jdId] });
      void queryClient.invalidateQueries({ queryKey: ['sourcing-ranked', jdId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save notes');
    },
  });

  const openNotes = (entry: PipelineEntryDto) => {
    setNotesText(entry.notes ?? '');
    setNotesEntry(entry);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-muted-foreground">
          Track candidates for a JD from sourcing through to the client.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Description</CardTitle>
          <CardDescription>Each JD has its own pipeline board.</CardDescription>
        </CardHeader>
        <CardContent>
          <JdPicker
            value={jdId}
            onChange={(id) =>
              router.replace(`/pipeline?jdId=${encodeURIComponent(id)}`, { scroll: false })
            }
          />
        </CardContent>
      </Card>

      {!jdId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Select a job description to view its pipeline</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Candidates enter the pipeline from the Sourcing screen or the ranked candidate list.
            </p>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => (
            <div key={stage} className="w-72 shrink-0 space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {PIPELINE_STAGES.map((stage) => {
            const columnEntries = (entries ?? []).filter((entry) => entry.stage === stage);
            return (
              <div key={stage} className="w-72 shrink-0 space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Badge variant="outline" className={cn('font-normal', STAGE_BADGE_CLASSES[stage])}>
                    {humanizeStage(stage)}
                  </Badge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {columnEntries.length}
                  </span>
                </div>
                <div className="min-h-[140px] space-y-2 rounded-lg border bg-muted/30 p-2">
                  {columnEntries.length === 0 ? (
                    <div className="flex h-24 items-center justify-center rounded-md border border-dashed">
                      <p className="text-xs text-muted-foreground">No candidates</p>
                    </div>
                  ) : (
                    columnEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        jdId={jdId}
                        isViewer={isViewer}
                        onMove={(e, s) => moveMutation.mutate({ entry: e, stage: s })}
                        onEditNotes={openNotes}
                        moving={moveMutation.isPending}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={notesEntry !== null} onOpenChange={(open) => !open && setNotesEntry(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Notes — {notesEntry?.candidate?.fullName ?? 'candidate'}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={5}
            placeholder="Screening notes, availability, salary expectation…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesEntry(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                notesEntry && notesMutation.mutate({ entryId: notesEntry.id, notes: notesText })
              }
              disabled={notesMutation.isPending}
            >
              {notesMutation.isPending && <Loader2 className="animate-spin" />}
              Save notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <PipelineContent />
    </React.Suspense>
  );
}
