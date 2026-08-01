'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Info } from 'lucide-react';

import { BulkUploadCard } from '@/components/sourcing/bulk-upload-card';
import { JdPicker } from '@/components/sourcing/jd-picker';
import { JobProgressCard } from '@/components/sourcing/job-progress';
import { RankedTable } from '@/components/sourcing/ranked-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/use-auth';

function SourcingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';

  const jdId = searchParams.get('jdId') ?? undefined;
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null);

  const selectJd = (id: string) => {
    setActiveJobId(null);
    router.replace(`/sourcing?jdId=${encodeURIComponent(id)}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sourcing</h1>
        <p className="text-muted-foreground">
          Bulk-analyze exported CVs against a JD and build a ranked, pipeline-ready shortlist.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job Description</CardTitle>
          <CardDescription>Pick the JD to source against — the link is shareable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <JdPicker value={jdId} onChange={selectJd} />
          <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Naukri Resdex API integration arrives in Phase 3 — until then, export CVs from Naukri
              and drop them here.
            </p>
          </div>
        </CardContent>
      </Card>

      {!jdId ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm font-medium">Select a job description to begin</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bulk upload, job progress and the ranked candidate list appear once a JD is chosen.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            {!isViewer && <BulkUploadCard jdId={jdId} onJobStarted={(job) => setActiveJobId(job.id)} />}
            <JobProgressCard jdId={jdId} activeJobId={activeJobId} onSelectJob={setActiveJobId} />
          </div>
          <RankedTable jdId={jdId} />
        </>
      )}
    </div>
  );
}

export default function SourcingPage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <SourcingContent />
    </React.Suspense>
  );
}
