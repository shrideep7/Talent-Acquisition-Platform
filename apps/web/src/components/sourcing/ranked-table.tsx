'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, NotebookPen, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  PIPELINE_STAGES,
  type MatchAnalysisDto,
  type PipelineEntryDto,
  type PipelineStage,
} from '@mfd/shared';

import { BreakdownPanel } from '@/components/breakdown-panel';
import { humanizeStage, STAGE_BADGE_CLASSES } from '@/components/sourcing/stages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { cn, scoreColor } from '@/lib/utils';

/** Shape of GET /sourcing/ranked rows — verified against apps/api/src/sourcing/sourcing.service.ts (RankedCandidateDto). */
interface RankedCandidate {
  candidateId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  noticePeriod: string | null;
  totalYearsExperience: number | null;
  totalScore: number;
  analysisId: string;
  cvDocumentId: string | null;
  pipelineStage: PipelineStage | null;
  pipelineEntryId: string | null;
  notes: string | null;
}

type SortKey = 'score' | 'experience' | 'notice';

/** Rough notice-period ordering: immediate first, then by days; unknown last. */
function noticeRank(notice: string | null): number {
  if (!notice) return Number.MAX_SAFE_INTEGER;
  if (/immediate|serving/i.test(notice)) return 0;
  const match = /(\d+(?:\.\d+)?)/.exec(notice);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const n = Number(match[1]);
  if (/month/i.test(notice)) return n * 30;
  if (/week/i.test(notice)) return n * 7;
  return n;
}

function NotesPopover({
  row,
  jdId,
  disabled,
}: {
  row: RankedCandidate;
  jdId: string;
  disabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');

  const saveMutation = useMutation({
    mutationFn: async (notes: string) => {
      let entryId = row.pipelineEntryId;
      if (!entryId) {
        const entry = await api.post<PipelineEntryDto>('/pipeline', {
          jdId,
          candidateId: row.candidateId,
        });
        entryId = entry.id;
      }
      return api.patch<PipelineEntryDto>(`/pipeline/${entryId}`, { notes });
    },
    onSuccess: () => {
      toast.success('Notes saved');
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['sourcing-ranked', jdId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', jdId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not save notes');
    },
  });

  if (disabled) {
    return row.notes ? (
      <span className="block max-w-[10rem] truncate text-xs text-muted-foreground" title={row.notes}>
        {row.notes}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setText(row.notes ?? '');
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs">
          <NotebookPen className="h-3.5 w-3.5" />
          {row.notes ? (
            <span className="max-w-[7rem] truncate font-normal">{row.notes}</span>
          ) : (
            'Add'
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <p className="text-sm font-medium">Notes for {row.fullName}</p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Screening notes, availability, salary expectation…"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={() => saveMutation.mutate(text)} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="animate-spin" />}
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BreakdownDialog({
  row,
  onClose,
}: {
  row: RankedCandidate | null;
  onClose: () => void;
}) {
  const { data: analysis, isLoading } = useQuery({
    queryKey: ['analysis', row?.analysisId],
    queryFn: () => api.get<MatchAnalysisDto>(`/analyses/${row?.analysisId}`),
    enabled: row !== null,
  });

  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Match breakdown{row ? ` — ${row.fullName}` : ''}
          </DialogTitle>
        </DialogHeader>
        {isLoading || !analysis ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <BreakdownPanel
            breakdown={analysis.breakdown}
            verify={{ candidateId: analysis.candidateId, jdId: analysis.jdId }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RankedTable({ jdId }: { jdId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const [sortBy, setSortBy] = React.useState<SortKey>('score');
  const [minScore, setMinScore] = React.useState(0);
  const [locationFilter, setLocationFilter] = React.useState('');
  const [stageFilter, setStageFilter] = React.useState<PipelineStage[]>([]);
  const [breakdownRow, setBreakdownRow] = React.useState<RankedCandidate | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ['sourcing-ranked', jdId],
    queryFn: () => api.get<RankedCandidate[]>(`/sourcing/ranked?jdId=${encodeURIComponent(jdId)}`),
  });

  const stageMutation = useMutation({
    mutationFn: ({ row, stage }: { row: RankedCandidate; stage: PipelineStage }) => {
      if (row.pipelineEntryId) {
        return api.patch<PipelineEntryDto>(`/pipeline/${row.pipelineEntryId}`, { stage });
      }
      return api.post<PipelineEntryDto>('/pipeline', { jdId, candidateId: row.candidateId, stage });
    },
    onSuccess: (_entry, { stage }) => {
      toast.success(`Moved to ${humanizeStage(stage)}`);
      void queryClient.invalidateQueries({ queryKey: ['sourcing-ranked', jdId] });
      void queryClient.invalidateQueries({ queryKey: ['pipeline', jdId] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update pipeline stage');
    },
  });

  const filtered = React.useMemo(() => {
    if (!rows) return [];
    const location = locationFilter.trim().toLowerCase();
    const list = rows.filter((row) => {
      if (row.totalScore < minScore) return false;
      if (location && !(row.location ?? '').toLowerCase().includes(location)) return false;
      if (stageFilter.length > 0) {
        if (!row.pipelineStage || !stageFilter.includes(row.pipelineStage)) return false;
      }
      return true;
    });
    const sorted = [...list];
    if (sortBy === 'score') {
      sorted.sort((a, b) => b.totalScore - a.totalScore);
    } else if (sortBy === 'experience') {
      sorted.sort((a, b) => (b.totalYearsExperience ?? -1) - (a.totalYearsExperience ?? -1));
    } else {
      sorted.sort((a, b) => noticeRank(a.noticePeriod) - noticeRank(b.noticePeriod));
    }
    return sorted;
  }, [rows, minScore, locationFilter, stageFilter, sortBy]);

  const toggleStage = (stage: PipelineStage) => {
    setStageFilter((prev) =>
      prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage],
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ranked Candidates</CardTitle>
        <CardDescription>
          Best latest-analysis score first — every candidate analyzed against this JD.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Score</SelectItem>
                <SelectItem value="experience">Experience</SelectItem>
                <SelectItem value="notice">Notice period</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-44 space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Min score: <span className="font-semibold tabular-nums text-foreground">{minScore}</span>
            </Label>
            <Slider
              value={[minScore]}
              onValueChange={(v) => setMinScore(v[0] ?? 0)}
              min={0}
              max={100}
              step={5}
              className="py-1.5"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Location</Label>
            <Input
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              placeholder="Filter by location…"
              className="h-8 w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Stage</Label>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STAGES.map((stage) => {
                const active = stageFilter.includes(stage);
                return (
                  <button key={stage} type="button" onClick={() => toggleStage(stage)}>
                    <Badge
                      variant="outline"
                      className={cn(
                        'cursor-pointer select-none font-normal transition-colors',
                        active ? STAGE_BADGE_CLASSES[stage] : 'text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {humanizeStage(stage)}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm font-medium">No analyzed candidates yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run a bulk upload above, or analyze candidates individually in the Analyzer.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="text-sm text-muted-foreground">No candidates match the current filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Exp</TableHead>
                  <TableHead>Notice</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row, index) => (
                  <TableRow key={row.candidateId}>
                    <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('font-semibold tabular-nums', scoreColor(row.totalScore))}
                      >
                        {Math.round(row.totalScore)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/candidates/${row.candidateId}`}
                        className="font-medium hover:underline"
                      >
                        {row.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.totalYearsExperience !== null ? `${row.totalYearsExperience} yrs` : '—'}
                    </TableCell>
                    <TableCell>{row.noticePeriod ?? '—'}</TableCell>
                    <TableCell>{row.location ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col text-xs text-muted-foreground">
                        <span className="max-w-[12rem] truncate">{row.email ?? '—'}</span>
                        <span>{row.phone ?? ''}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isViewer ? (
                        row.pipelineStage ? (
                          <Badge
                            variant="outline"
                            className={cn('font-normal', STAGE_BADGE_CLASSES[row.pipelineStage])}
                          >
                            {humanizeStage(row.pipelineStage)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )
                      ) : (
                        <Select
                          value={row.pipelineStage ?? ''}
                          onValueChange={(stage) =>
                            stageMutation.mutate({ row, stage: stage as PipelineStage })
                          }
                          disabled={stageMutation.isPending}
                        >
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue placeholder="Not in pipeline" />
                          </SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STAGES.map((stage) => (
                              <SelectItem key={stage} value={stage}>
                                {humanizeStage(stage)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <NotesPopover row={row} jdId={jdId} disabled={isViewer} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setBreakdownRow(row)}
                        >
                          Breakdown
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 gap-1 px-2 text-xs"
                          disabled={!row.cvDocumentId}
                          onClick={() =>
                            router.push(
                              `/analyzer?jdId=${jdId}&candidateId=${row.candidateId}&cvDocumentId=${row.cvDocumentId}`,
                            )
                          }
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Optimize CV
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <BreakdownDialog row={breakdownRow} onClose={() => setBreakdownRow(null)} />
    </Card>
  );
}
