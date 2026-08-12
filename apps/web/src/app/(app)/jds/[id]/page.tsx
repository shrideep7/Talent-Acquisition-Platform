'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  FileSearch,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { JdDto, JdShareDto } from '@mfd/shared';

import { DeleteJdDialog } from '@/components/jds/delete-jd-dialog';
import { experienceRange } from '@/components/jds/jd-utils';
import { ShareJdDialog } from '@/components/vendors/share-jd-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';
import { formatDate } from '@/lib/utils';

function CriteriaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium">{value ?? '—'}</span>
    </div>
  );
}

export default function JdDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [shareOpen, setShareOpen] = React.useState(false);

  const jdQuery = useQuery({
    queryKey: ['jd', id],
    queryFn: () => api.get<JdDto>(`/jds/${id}`),
    enabled: Boolean(id),
  });
  const jd = jdQuery.data;

  const sharesQuery = useQuery({
    queryKey: ['jd-shares', id],
    queryFn: () => api.get<JdShareDto[]>(`/vendors/shares?jdId=${id}`),
    enabled: Boolean(id),
  });
  const shares = sharesQuery.data ?? [];

  const reparse = useMutation({
    mutationFn: () => api.post<JdDto>(`/jds/${id}/reparse`),
    onSuccess: () => {
      toast.success('JD reparsed — criteria updated');
      queryClient.invalidateQueries({ queryKey: ['jd', id] });
      queryClient.invalidateQueries({ queryKey: ['jds'] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Reparse failed');
    },
  });

  if (jdQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-[480px] w-full" />
          <Skeleton className="h-[480px] w-full" />
        </div>
      </div>
    );
  }

  if (jdQuery.isError || !jd) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="font-medium">Job description not found</p>
          <p className="text-sm text-muted-foreground">
            It may have been deleted, or the link is invalid.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/jds">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Job Descriptions
          </Link>
        </Button>
      </div>
    );
  }

  const parsed = jd.parsedCriteria;
  const mustHave = parsed?.requiredSkills.filter((s) => s.importance === 'must_have') ?? [];
  const niceToHave = parsed?.requiredSkills.filter((s) => s.importance === 'nice_to_have') ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href="/jds"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Job Descriptions
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{jd.title}</h1>
            <p className="text-muted-foreground">
              {jd.clientName}
              {jd.createdBy ? ` · added by ${jd.createdBy.name}` : ''} ·{' '}
              {formatDate(jd.createdAt)}
              {jd.fileName ? ` · ${jd.fileName}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/analyzer?jdId=${jd.id}`}>
                <FileSearch className="mr-2 h-4 w-4" />
                Analyze
              </Link>
            </Button>
            {!isViewer && (
              <>
                <Button variant="outline" onClick={() => setShareOpen(true)}>
                  <Send className="mr-2 h-4 w-4" />
                  Share with vendors
                </Button>
                <Button
                  variant="outline"
                  onClick={() => reparse.mutate()}
                  disabled={reparse.isPending}
                >
                  {reparse.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Reparse
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Parsed criteria */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Parsed criteria</CardTitle>
            <CardDescription>Structured requirements extracted from the JD</CardDescription>
          </CardHeader>
          <CardContent>
            {!parsed ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-500" />
                <div>
                  <p className="text-sm font-medium">Parsing pending or failed</p>
                  <p className="text-sm text-muted-foreground">
                    The criteria for this JD have not been extracted yet.
                  </p>
                </div>
                {!isViewer && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reparse.mutate()}
                    disabled={reparse.isPending}
                  >
                    {reparse.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    Reparse now
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="divide-y">
                  <CriteriaRow label="Seniority" value={parsed.seniorityLevel ?? '—'} />
                  <CriteriaRow label="Experience" value={experienceRange(parsed)} />
                  <CriteriaRow label="Location" value={parsed.location ?? '—'} />
                  <CriteriaRow
                    label="Work mode"
                    value={
                      parsed.workMode === 'unspecified' ? (
                        '—'
                      ) : (
                        <span className="capitalize">{parsed.workMode}</span>
                      )
                    }
                  />
                  <CriteriaRow label="Domain" value={parsed.domain ?? '—'} />
                  <CriteriaRow label="Notice period" value={parsed.noticePeriod ?? '—'} />
                  <CriteriaRow label="Budget" value={parsed.budget ?? '—'} />
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium">Must-have skills ({mustHave.length})</p>
                  {mustHave.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None identified.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {mustHave.map((skill) => (
                        <Badge key={skill.name}>{skill.name}</Badge>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Nice-to-have skills ({niceToHave.length})</p>
                  {niceToHave.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None identified.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {niceToHave.map((skill) => (
                        <Badge key={skill.name} variant="outline">
                          {skill.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {parsed.educationRequirements.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Education</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {parsed.educationRequirements.map((edu) => (
                        <li key={edu}>{edu}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsed.certifications.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Certifications</p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {parsed.certifications.map((cert) => (
                        <li key={cert}>{cert}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {parsed.keywords.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">ATS keywords (ranked)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {parsed.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Original text */}
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Original JD text</CardTitle>
            <CardDescription>Raw text as uploaded or pasted</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[560px] rounded-md border bg-muted/20 p-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{jd.rawText}</p>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Vendor share history */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Shared with vendors</CardTitle>
          <CardDescription>
            {shares.length === 0
              ? 'This JD has not been sent to any vendor yet.'
              : `Sent to ${new Set(shares.filter((s) => s.status === 'SENT').map((s) => s.vendorId)).size} vendor(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shares.length === 0 ? (
            !isViewer && (
              <Button variant="outline" onClick={() => setShareOpen(true)}>
                <Send className="mr-2 h-4 w-4" />
                Share with vendors
              </Button>
            )
          ) : (
            <ul className="divide-y">
              {shares.map((share) => (
                <li key={share.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {share.vendorCompanyName ?? 'Vendor'}
                  </span>
                  {share.attached && (
                    <Badge variant="outline" className="gap-1 font-normal">
                      <Paperclip className="h-3 w-3" /> attached
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      share.status === 'SENT'
                        ? 'border-transparent bg-emerald-100 font-normal text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : 'border-transparent bg-red-100 font-normal text-red-900 dark:bg-red-900/40 dark:text-red-200'
                    }
                    title={share.error ?? undefined}
                  >
                    {share.status === 'SENT' ? 'Sent' : 'Failed'}
                  </Badge>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(share.sentAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ShareJdDialog jd={jd} open={shareOpen} onOpenChange={setShareOpen} />

      <DeleteJdDialog
        jdId={jd.id}
        jdTitle={jd.title}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push('/jds')}
      />
    </div>
  );
}
