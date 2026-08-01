'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Briefcase, Clock, FileSearch, Mail, MapPin, Phone, Trash2 } from 'lucide-react';
import type { CandidateDto } from '@mfd/shared';

import { ConsentBadge, SourceBadge } from '@/components/candidates/candidate-badges';
import { ConsentCard } from '@/components/candidates/consent-card';
import { CvDocumentsCard } from '@/components/candidates/cv-documents-card';
import { DeleteCandidateDialog } from '@/components/candidates/delete-candidate-dialog';
import { MatchHistoryCard } from '@/components/candidates/match-history-card';
import { SkillsBoard } from '@/components/candidates/skills-board';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';

function ProfileRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words text-sm">{value ?? '—'}</p>
      </div>
    </div>
  );
}

export default function CandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const candidateId = params.id;

  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const candidateQuery = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => api.get<CandidateDto>(`/candidates/${candidateId}`),
  });
  const candidate = candidateQuery.data;

  if (candidateQuery.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (candidateQuery.isError || !candidate) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <p className="text-lg font-medium">Candidate not found</p>
        <p className="text-sm text-muted-foreground">
          The candidate may have been erased under a DPDP request.
        </p>
        <Button asChild variant="outline">
          <Link href="/candidates">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to candidates
          </Link>
        </Button>
      </div>
    );
  }

  const documents = candidate.cvDocuments ?? [];
  const newestDocId = documents[0]?.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Link
          href="/candidates"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Candidates
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{candidate.fullName}</h1>
              <SourceBadge source={candidate.source} />
              <ConsentBadge status={candidate.consentStatus} />
            </div>
            {candidate.currentTitle && (
              <p className="text-muted-foreground">{candidate.currentTitle}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild disabled={!newestDocId}>
              <Link
                href={
                  newestDocId
                    ? `/analyzer?candidateId=${candidate.id}&cvDocumentId=${newestDocId}`
                    : '/analyzer'
                }
              >
                <FileSearch className="mr-2 h-4 w-4" />
                Analyze against JD
              </Link>
            </Button>
            {!isViewer && (
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                DPDP Delete
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Body grid */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact &amp; Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProfileRow icon={Mail} label="Email" value={candidate.email} />
              <ProfileRow icon={Phone} label="Phone" value={candidate.phone} />
              <ProfileRow icon={MapPin} label="Location" value={candidate.currentLocation} />
              <ProfileRow icon={Clock} label="Notice period" value={candidate.noticePeriod} />
              <ProfileRow
                icon={Briefcase}
                label="Total experience"
                value={
                  candidate.totalYearsExperience !== null
                    ? `${candidate.totalYearsExperience} yrs`
                    : null
                }
              />
            </CardContent>
          </Card>

          <ConsentCard candidate={candidate} isViewer={isViewer} />
        </div>

        {/* Right column */}
        <div className="space-y-6 lg:col-span-2">
          <CvDocumentsCard candidateId={candidate.id} documents={documents} />
          <SkillsBoard candidateId={candidate.id} isViewer={isViewer} />
          <MatchHistoryCard candidateId={candidate.id} />
        </div>
      </div>

      <DeleteCandidateDialog
        candidateId={candidate.id}
        candidateName={candidate.fullName}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => router.push('/candidates')}
      />
    </div>
  );
}
