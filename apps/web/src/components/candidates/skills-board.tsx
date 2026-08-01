'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronRight, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JdDto, SkillMatchTier, VerifiedSkillDto, VerifiedSkillStatus } from '@mfd/shared';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';

const TIER_STYLES: Partial<Record<SkillMatchTier, string>> = {
  INFERRED: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  UNVERIFIED_POSSIBLE:
    'border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
};

const STATUS_STYLES: Record<VerifiedSkillStatus, string> = {
  PROPOSED: 'border-transparent bg-secondary text-secondary-foreground',
  ACCEPTED: 'border-transparent bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  VERIFIED:
    'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  REJECTED: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
};

function TierBadge({ tier }: { tier: SkillMatchTier }) {
  return (
    <Badge className={cn('shadow-none', TIER_STYLES[tier] ?? 'bg-secondary text-secondary-foreground border-transparent')}>
      {tier.replace(/_/g, ' ')}
    </Badge>
  );
}

function CollapsedGroup({
  label,
  status,
  rows,
}: {
  label: string;
  status: VerifiedSkillStatus;
  rows: VerifiedSkillDto[];
}) {
  const [open, setOpen] = React.useState(false);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-medium hover:bg-muted/50"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          {label}
        </span>
        <Badge variant="secondary" className="tabular-nums">
          {rows.length}
        </Badge>
      </button>
      {open && (
        <ul className="divide-y border-t">
          {rows.map((row) => (
            <li key={row.id} className="space-y-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{row.skill}</span>
                <Badge className={cn('shadow-none', STATUS_STYLES[status])}>{status}</Badge>
                {row.verifiedAt && (
                  <span className="text-xs text-muted-foreground">
                    {status === 'VERIFIED' ? 'Verified' : 'Decided'} {formatDate(row.verifiedAt)}
                  </span>
                )}
              </div>
              {row.evidence && <p className="text-xs text-muted-foreground">{row.evidence}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SkillsBoard({
  candidateId,
  isViewer,
}: {
  candidateId: string;
  isViewer: boolean;
}) {
  const queryClient = useQueryClient();

  const skillsQuery = useQuery({
    queryKey: ['skills', candidateId],
    queryFn: () => api.get<VerifiedSkillDto[]>(`/skills?candidateId=${candidateId}`),
  });
  const jdsQuery = useQuery({
    queryKey: ['jds', ''],
    queryFn: () => api.get<JdDto[]>('/jds'),
    enabled: !isViewer,
  });

  const skills = skillsQuery.data ?? [];
  const proposed = skills.filter((s) => s.status === 'PROPOSED');
  const accepted = skills.filter((s) => s.status === 'ACCEPTED');
  const verified = skills.filter((s) => s.status === 'VERIFIED');
  const rejected = skills.filter((s) => s.status === 'REJECTED');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['skills', candidateId] });

  // --- decide (accept / reject / verify) -----------------------------------
  const [verifyTarget, setVerifyTarget] = React.useState<VerifiedSkillDto | null>(null);
  const [verifyEvidence, setVerifyEvidence] = React.useState('');

  const decide = useMutation({
    mutationFn: ({
      id,
      status,
      evidence,
    }: {
      id: string;
      status: 'ACCEPTED' | 'REJECTED' | 'VERIFIED';
      evidence?: string;
    }) => api.patch<VerifiedSkillDto>(`/skills/${id}`, { status, ...(evidence ? { evidence } : {}) }),
    onSuccess: (updated) => {
      toast.success(`"${updated.skill}" marked ${updated.status.toLowerCase()}`);
      invalidate();
      setVerifyTarget(null);
      setVerifyEvidence('');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update skill');
    },
  });

  // --- record verified skill directly ---------------------------------------
  const [newSkill, setNewSkill] = React.useState('');
  const [newEvidence, setNewEvidence] = React.useState('');
  const [newJdId, setNewJdId] = React.useState<string>('none');

  const create = useMutation({
    mutationFn: () =>
      api.post<VerifiedSkillDto>('/skills', {
        candidateId,
        skill: newSkill.trim(),
        evidence: newEvidence.trim(),
        ...(newJdId !== 'none' ? { jdId: newJdId } : {}),
      }),
    onSuccess: (created) => {
      toast.success(`Verified skill "${created.skill}" recorded`);
      invalidate();
      setNewSkill('');
      setNewEvidence('');
      setNewJdId('none');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to record skill');
    },
  });

  const canCreate = newSkill.trim().length > 0 && newEvidence.trim().length > 0 && !create.isPending;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Skill Verification</CardTitle>
        <CardDescription>
          Skills verified in the genuineness interview may be added to generated CVs, with the
          evidence recorded here as their citation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {skillsQuery.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <>
            {/* Proposed skills awaiting a decision */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                Proposed{' '}
                <span className="font-normal text-muted-foreground">({proposed.length})</span>
              </h4>
              {proposed.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                  No proposed skills awaiting review. Skills are proposed automatically when a
                  match analysis infers them from CV evidence.
                </p>
              ) : (
                <ul className="space-y-2">
                  {proposed.map((row) => (
                    <li key={row.id} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{row.skill}</span>
                        <TierBadge tier={row.tier} />
                      </div>
                      {row.evidence && (
                        <p className="text-xs text-muted-foreground">{row.evidence}</p>
                      )}
                      {!isViewer && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => decide.mutate({ id: row.id, status: 'ACCEPTED' })}
                            disabled={decide.isPending}
                          >
                            <Check className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                            Accept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => decide.mutate({ id: row.id, status: 'REJECTED' })}
                            disabled={decide.isPending}
                          >
                            <X className="mr-1 h-3.5 w-3.5 text-red-600" />
                            Reject
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setVerifyEvidence('');
                              setVerifyTarget(row);
                            }}
                            disabled={decide.isPending}
                          >
                            Verify…
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Decided groups */}
            {(accepted.length > 0 || verified.length > 0 || rejected.length > 0) && (
              <div className="space-y-2">
                <CollapsedGroup label="Verified" status="VERIFIED" rows={verified} />
                <CollapsedGroup label="Accepted" status="ACCEPTED" rows={accepted} />
                <CollapsedGroup label="Rejected" status="REJECTED" rows={rejected} />
              </div>
            )}

            {/* Record a verified skill directly */}
            {!isViewer && (
              <>
                <Separator />
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (canCreate) create.mutate();
                  }}
                >
                  <h4 className="text-sm font-medium">Record verified skill</h4>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="new-skill">Skill</Label>
                      <Input
                        id="new-skill"
                        placeholder="e.g. Kafka"
                        value={newSkill}
                        onChange={(e) => setNewSkill(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Related JD (optional)</Label>
                      <Select value={newJdId} onValueChange={setNewJdId}>
                        <SelectTrigger>
                          <SelectValue placeholder="No specific JD" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No specific JD</SelectItem>
                          {(jdsQuery.data ?? []).map((jd) => (
                            <SelectItem key={jd.id} value={jd.id}>
                              {jd.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-evidence">Evidence</Label>
                    <Textarea
                      id="new-evidence"
                      placeholder="What did the candidate demonstrate? Project, context, duration…"
                      value={newEvidence}
                      onChange={(e) => setNewEvidence(e.target.value)}
                      rows={2}
                    />
                  </div>
                  <Button type="submit" size="sm" disabled={!canCreate}>
                    {create.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Record skill
                  </Button>
                </form>
              </>
            )}
          </>
        )}
      </CardContent>

      {/* Verify dialog — evidence required */}
      <Dialog
        open={verifyTarget !== null}
        onOpenChange={(next) => {
          if (decide.isPending) return;
          if (!next) {
            setVerifyTarget(null);
            setVerifyEvidence('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Verify &ldquo;{verifyTarget?.skill}&rdquo;</DialogTitle>
            <DialogDescription>
              Record the evidence from the genuineness interview. Verified skills may be added to
              generated CVs with this evidence as their citation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="verify-evidence">
              Evidence <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="verify-evidence"
              placeholder="What did the candidate demonstrate? Project, context, duration…"
              value={verifyEvidence}
              onChange={(e) => setVerifyEvidence(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVerifyTarget(null)}
              disabled={decide.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                verifyTarget &&
                decide.mutate({
                  id: verifyTarget.id,
                  status: 'VERIFIED',
                  evidence: verifyEvidence.trim(),
                })
              }
              disabled={verifyEvidence.trim().length === 0 || decide.isPending}
            >
              {decide.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Mark verified
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
